import type { Server as HttpServer } from 'node:http';
import type { WebSocket } from 'ws';

import { VOICE_SOCKET_PATH, type ClientMessage, type ServerMessage } from '$lib/voice/protocol';

import { VoiceExchange } from './exchange';
import { claimTicket, type VoiceGrant } from './tickets';

/**
 * Where the microphone arrives.
 *
 * SvelteKit has no WebSocket of its own, and every community answer to that
 * replaces the adapter or reaches into its internals. Neither is needed. What is
 * needed is one fact that is easy to miss: this file, the ticket route and the
 * whole pipeline have to be **the same module instances**. A socket bundled
 * separately would hold its own copy of the ticket map and would never recognise
 * a ticket the route had issued.
 *
 * So the direction is inverted from the obvious one. Nothing outside reaches in
 * to register a handler; instead the process that owns the HTTP server publishes
 * it under a global symbol, and this file, which lives inside the app's own
 * bundle, picks it up and attaches. Two publishers, one for each way llooma runs:
 * `server.js` in production and the dev plugin in `vite.config.ts`.
 *
 * And the attaching is triggered from the ticket route rather than from a hook,
 * which makes the ordering provable rather than likely: a socket can only be
 * opened by somebody holding a ticket, and a ticket can only come from that
 * route, so the listener is always there before the first upgrade arrives.
 */

/**
 * Where the HTTP server is left for this file to find.
 *
 * A registered symbol rather than a string key: it cannot collide with anything,
 * it cannot be reached by accident, and it will not turn up in the enumeration
 * of a global that something else is walking.
 */
export const HTTP_SERVER = Symbol.for('llooma.httpServer');

/** What `server.js` and the dev plugin write, and what this file reads. */
type Host = typeof globalThis & { [HTTP_SERVER]?: HttpServer };

let attached = false;

/**
 * Attach the voice socket, once, to whichever server is running us.
 *
 * Idempotent and cheap, so the ticket route calls it on every request without
 * thinking about it. Answers whether there is a socket to connect to, so a
 * caller can refuse honestly rather than hand out a ticket for a door that does
 * not exist.
 */
export async function ensureVoiceSocket(): Promise<boolean> {
	if (attached) return true;

	const http = (globalThis as Host)[HTTP_SERVER];
	if (!http) return false;

	/**
	 * `ws` without its native accelerators, and loaded only once voice is used.
	 *
	 * `bufferutil` and `utf-8-validate` are optional C++ addons that `ws` picks up
	 * with a `require` inside a `try`. Bundled, that `require` resolves at build
	 * time instead of failing at run time, so the fallback the `catch` exists for
	 * is never taken and the wrappers call into a stub: `bufferUtil.unmask is not
	 * a function`, on the first frame any client sends. These two flags are the
	 * library's own documented way of asking for the JavaScript implementation,
	 * and they are read the first time it requires its buffer helpers.
	 *
	 * Hence the dynamic import, and it is the only reason for it: a static one is
	 * hoisted above everything in the module body, so the flags would be set after
	 * `ws` had already read them. Nothing measurable is lost. The addons are for a
	 * server masking frames for thousands of peers, not for one conversation at
	 * fifty frames a second.
	 */
	process.env.WS_NO_BUFFER_UTIL = '1';
	process.env.WS_NO_UTF_8_VALIDATE = '1';
	const { WebSocketServer } = await import('ws');

	const sockets = new WebSocketServer({ noServer: true });

	http.on('upgrade', (request, socket, head) => {
		// Every other upgrade on this server belongs to somebody else: in
		// development that is Vite's own hot reload. Not ours, not touched, not
		// destroyed, so the listener that does own it still gets it.
		const path = (request.url ?? '').split('?')[0];
		if (path !== VOICE_SOCKET_PATH) return;

		sockets.handleUpgrade(request, socket, head, (ws) => hold(ws));
	});

	attached = true;
	return true;
}

/**
 * One connection, from the upgrade to the end of the conversation.
 *
 * Nothing is trusted until the ticket has been read, and nothing is read from a
 * connection that has not presented one: an unaccredited socket is allowed to
 * send exactly one message, and only for as long as it takes somebody to open
 * one deliberately.
 */
function hold(ws: WebSocket): void {
	let grant: VoiceGrant | null = null;
	let exchange: VoiceExchange | null = null;

	// A socket that connects and then says nothing is not a conversation, it is a
	// held file descriptor. Cleared the moment a good ticket arrives.
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

			// The conversation being held. Empty until the first question makes one,
			// which is what keeps a visit that said nothing from leaving a record.
			send({ type: 'ready', sessionId: grant.sessionId ?? '' });
			send({ type: 'state', value: 'idle' });
			return;
		}

		switch (message.type) {
			case 'hello':
				// Twice is not a protocol, it is a client trying something.
				return ws.close(4400, 'Already introduced');
			case 'end':
				// Not awaited: a turn takes as long as a model does, and the socket has
				// to keep reading while it runs. What it produces arrives as messages of
				// its own, which is the only channel anything here answers on.
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
		// A socket that failed is a socket that is closing. Nothing to say about it
		// that the close will not say, and nothing to keep.
		clearTimeout(introduce);
		exchange?.close();
	});
}

/**
 * One frame of audio, as a single buffer.
 *
 * `ws` hands over whatever it happened to receive: a `Buffer`, an array of them
 * when a message spanned reads, or an `ArrayBuffer` depending on how it was
 * configured. Normalised once, here, so nothing downstream has three cases to
 * think about for what is conceptually twenty milliseconds of sound.
 */
function toBuffer(data: Buffer | ArrayBuffer | Buffer[]): Buffer {
	if (Buffer.isBuffer(data)) return data;
	if (Array.isArray(data)) return Buffer.concat(data);
	return Buffer.from(data);
}
