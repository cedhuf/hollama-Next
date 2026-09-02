/**
 * The production entry, which is the ordinary one plus five lines.
 *
 * `adapter-node` keeps every responsibility it had. All this adds is publishing
 * the HTTP server where the app's own code can find it, so the voice socket can
 * attach from inside the bundle (see `src/lib/server/voice/socket.ts`).
 *
 * The export read below is real but undocumented, so it is checked: a future
 * adapter that stops exporting it makes this refuse to start rather than a voice
 * mode that silently never connects.
 */
import { server } from './build/index.js';

/** `Symbol.for` reads from the global registry, so this and the bundled app agree on one symbol without importing anything from each other: the app is bundled and its internal paths are not addressable from out here. */
const HTTP_SERVER = Symbol.for('llooma.httpServer');

const http = server?.server;

if (!http || typeof http.on !== 'function') {
	console.error(
		[
			'llooma: could not reach the HTTP server behind adapter-node.',
			'',
			'`build/index.js` no longer exports a `server` whose `.server` is a',
			'node:http server. Voice mode needs it in order to accept a WebSocket.',
			'',
			'Fix: pin @sveltejs/adapter-node to a version that exports it, or replace',
			'this file with a custom entry built on build/handler.js.'
		].join('\n')
	);
	process.exit(1);
}

globalThis[HTTP_SERVER] = http;
