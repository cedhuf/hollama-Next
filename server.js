/**
 * The production entry, which is the ordinary one plus five lines.
 *
 * `adapter-node` keeps every responsibility it already had: the port, the host,
 * `ORIGIN`, `BODY_SIZE_LIMIT`, graceful shutdown, keep-alive timeouts, socket
 * activation. Importing its entry starts the server exactly as `node
 * build/index.js` would. All this adds is publishing the HTTP server where the
 * app's own code can find it, so the voice socket can attach to it from inside
 * the bundle (see `src/lib/server/voice/socket.ts` for why it has to be that way
 * round).
 *
 * The alternative the documentation offers is to start from `build/handler.js`
 * and write the listening and shutdown logic by hand, which means reimplementing
 * what adapter-node already does and then drifting from it at every release.
 *
 * The export read below is real but undocumented, so it is checked rather than
 * assumed: if a future adapter stops exporting it, this refuses to start and
 * says what to do, which is a great deal better than a voice mode that silently
 * never connects on somebody else's instance.
 */
import { server } from './build/index.js';

/**
 * The meeting point, named the same way on both sides.
 *
 * `Symbol.for` reads from the global registry, so this and the bundled app agree
 * on one symbol without importing anything from each other, which is the whole
 * reason it is a registered symbol rather than an exported constant: the app is
 * bundled and its internal paths are not addressable from out here.
 */
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
