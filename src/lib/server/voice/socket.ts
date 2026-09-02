import type { Server as HttpServer, IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import type { WebSocket, WebSocketServer as WebSocketServerType } from 'ws';

import { VOICE_SOCKET_PATH, type ClientMessage, type ServerMessage } from '$lib/voice/protocol';

import { VoiceExchange } from './exchange';
import { claimTicket, type VoiceGrant } from './tickets';

/**
 * Where the microphone arrives.
 *
 * SvelteKit has no WebSocket of its own, and the fact easy to miss is that this
 * file, the ticket route and the pipeline have to be **the same module
 * instances**, or a separately bundled socket holds its own ticket map.
 *
 * So the direction is inverted: the process that owns the HTTP server publishes
 * it under a global symbol (`server.js` in production, the dev plugin in
 * `vite.config.ts`), and this file picks it up from inside the bundle.
 *
 * Attaching is triggered from the ticket route rather than a hook, which makes
 * the ordering provable: a ticket comes only from that route.
 */

/** A registered symbol rather than a string key: it cannot collide, and it will not turn up in an enumeration of a global. */
export const HTTP_SERVER = Symbol.for('llooma.httpServer');

/**
 * What this file leaves on the server it has attached to, rather than in this
 * module.
 *
 * In development the HTTP server outlives every module: Vite re-evaluates this
 * file on any change, resetting a module-level flag while the previous
 * listener is still attached. Two listeners then answer one upgrade and `ws`
 * throws "called more than once with the same socket", taking the dev server
 * down. So the record lives where the listener does, and a fresh evaluation
 * finds its predecessor and replaces it.
 */
const ATTACHED = Symbol.for('llooma.voiceSocketAttached');

/** What `server.js` and the dev plugin write, and what this file reads. */
type Host = typeof globalThis & { [HTTP_SERVER]?: HttpServer };

/** The listener and the server behind it, kept together so both can be undone. */
interface Attachment {
	listener: (request: IncomingMessage, socket: Duplex, head: Buffer) => void;
	sockets: WebSocketServerType;
}

type Attached = HttpServer & { [ATTACHED]?: Attachment };

/** The server on the HTTP object is the authority. This is how the fast path tells "attached by me" from "attached by the module I just replaced". */
let sockets: WebSocketServerType | null = null;

/** Attaching has an `await` in the middle, and the first thing the voice screen does is ask for a ticket: two crossing requests would leave two listeners. */
let attaching: Promise<boolean> | null = null;

/** Idempotent and cheap, so the ticket route calls it on every request. Answers whether there is a socket, so a caller can refuse rather than hand out a ticket for a door that does not exist. */
export function ensureVoiceSocket(): Promise<boolean> {
	const http = (globalThis as Host)[HTTP_SERVER] as Attached | undefined;
	if (!http) return Promise.resolve(false);

	// Ours already, from this evaluation. Almost every call takes this path.
	if (sockets && http[ATTACHED]?.sockets === sockets) return Promise.resolve(true);

	// Cleared once it settles, so a failed attempt is retried rather than remembered.
	attaching ??= attach(http).finally(() => (attaching = null));
	return attaching;
}

async function attach(http: Attached): Promise<boolean> {
	/**
	 * `ws` without its native accelerators, loaded only once voice is used.
	 *
	 * `bufferutil` and `utf-8-validate` are optional C++ addons `ws` picks up with a
	 * `require` inside a `try`. Bundled, it resolves at build time instead of
	 * failing at run time, so the wrappers call into a stub and throw
	 * `bufferUtil.unmask is not a function` on the first frame.
	 *
	 * Hence the dynamic import: a static one is hoisted above the module body, so
	 * the flags would be set after `ws` read them.
	 */
	process.env.WS_NO_BUFFER_UTIL = '1';
	process.env.WS_NO_UTF_8_VALIDATE = '1';
	const { WebSocketServer } = await import('ws');

	/**
	 * Whatever attached before us, taken down first. Only ever found in development,
	 * and always a previous evaluation of this file: leaving it means two listeners
	 * racing for one socket, and skipping ours means the old module's ticket map
	 * refusing every ticket the current route issues.
	 *
	 * A conversation running across a reload ends here, which is honest: its
	 * exchange belongs to code that no longer exists.
	 */
	const previous = http[ATTACHED];
	if (previous) {
		http.off('upgrade', previous.listener);
		for (const client of previous.sockets.clients) client.terminate();
		previous.sockets.close();
	}

	const mine = new WebSocketServer({ noServer: true });
	const listener = (request: IncomingMessage, socket: Duplex, head: Buffer) => {
		// Every other upgrade on this server belongs to somebody else, which in
		// development is Vite's hot reload. Not ours, not touched.
		const path = (request.url ?? '').split('?')[0];
		if (path !== VOICE_SOCKET_PATH) return;

		mine.handleUpgrade(request, socket, head, (ws) => hold(ws));
	};

	http.on('upgrade', listener);
	http[ATTACHED] = { listener, sockets: mine };
	sockets = mine;
	return true;
}

/** Nothing is trusted until the ticket is read: an unaccredited socket may send exactly one message, and only for as long as opening one deliberately takes. */
function hold(ws: WebSocket): void {
	let grant: VoiceGrant | null = null;
	let exchange: VoiceExchange | null = null;

	// A socket that connects and says nothing is a held file descriptor.
	const introduce = setTimeout(() => {
		if (!grant) ws.close(4401, 'No ticket');
	}, 2_000);

	const send = (message: ServerMessage) => {
		if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(message));
	};

	ws.on('message', (data, isBinary) => {
		if (isBinary) {
			// Audio, and there is nowhere for it to go until we know whose it is.
			if (exchange) exchange.push(toBuffer(data));
			return;
		}

		let message: ClientMessage;
		try {
			message = JSON.parse(data.toString());
		} catch {
			return ws.close(4400, 'Not JSON');
		}

		if (!grant) {
			if (message.type !== 'hello') return ws.close(4401, 'Say hello first');
			grant = claimTicket(message.ticket);
			if (!grant) return ws.close(4401, 'Ticket refused');

			clearTimeout(introduce);
			exchange = new VoiceExchange(grant, {
				say: send,
				play: (audio) => {
					if (ws.readyState === ws.OPEN) ws.send(audio, { binary: true });
				}
			});

			// Empty until the first question makes one, which keeps a visit that said
			// nothing from leaving a record.
			send({ type: 'ready', sessionId: grant.sessionId ?? '' });
			send({ type: 'state', value: 'idle' });

			// The persona's opening line, if this conversation has one and nothing has
			// happened yet. Not awaited: it holds the floor for as long as it takes to
			// read, and the socket has to keep reading.
			void exchange.greet();
			return;
		}

		switch (message.type) {
			case 'hello':
				// Twice is not a protocol, it is a client trying something.
				return ws.close(4400, 'Already introduced');
			case 'end':
				// Not awaited: a turn takes as long as a model does, and the socket has to keep
				// reading. What it produces arrives as messages of its own.
				void exchange?.end();
				return;
			case 'interrupt':
				return exchange?.interrupt(message.heard);
			case 'cancel':
				return exchange?.cancel();
		}
	});

	ws.on('close', () => {
		clearTimeout(introduce);
		exchange?.close();
	});

	ws.on('error', () => {
		// A socket that failed is a socket that is closing.
		clearTimeout(introduce);
		exchange?.close();
	});
}

/** `ws` hands over a `Buffer`, an array of them when a message spanned reads, or an `ArrayBuffer`. Normalised once, so nothing downstream has three cases. */
function toBuffer(data: Buffer | ArrayBuffer | Buffer[]): Buffer {
	if (Buffer.isBuffer(data)) return data;
	if (Array.isArray(data)) return Buffer.concat(data);
	return Buffer.from(data);
}
