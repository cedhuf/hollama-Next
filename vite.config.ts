import { sveltekit } from '@sveltejs/kit/vite';
import basicSsl from '@vitejs/plugin-basic-ssl';
import { defineConfig, type Plugin, type ViteDevServer } from 'vite';

/**
 * TLS on the dev server, for testing on a real phone. Opt-in through
 * `pnpm dev:mobile`, and not a preference: browsers hand out
 * `navigator.mediaDevices` only in a secure context, so a phone pointed at
 * `http://192.168.x.x:5173` has no microphone at all and the app reports it as
 * a refused permission.
 *
 * The certificate is self-signed, which Safari objects to once and which a
 * service worker refuses outright. That costs nothing in development, where the
 * worker is not registered, but it does mean the installed PWA is not what this
 * lets you test; `mkcert` is the next step up.
 *
 * Off by default because it costs a warning to click through on the desktop too,
 * where `localhost` was already secure.
 */
const httpsRequested = process.env.HTTPS === '1';

/**
 * The development half of what `server.js` does in production.
 *
 * Voice mode needs a WebSocket and SvelteKit has none. The app attaches one from
 * inside its own bundle, since the socket has to share module state with the
 * route that issues its tickets; both entries only leave the HTTP server
 * somewhere the app can find it, under the same registered symbol.
 *
 * Vite's own hot-reload socket lives on this server too. Ours adds a listener
 * rather than replacing one, and ignores every upgrade not addressed to it.
 */
const voiceSocketHost: Plugin = {
	name: 'llooma-voice-socket-host',
	configureServer(server: ViteDevServer) {
		// Null in middleware mode, where there is no server of ours to attach to.
		if (!server.httpServer) return;
		(globalThis as Record<symbol, unknown>)[Symbol.for('llooma.httpServer')] = server.httpServer;
	}
};

export default defineConfig(({ command }) => ({
	plugins: [sveltekit(), voiceSocketHost, ...(httpsRequested ? [basicSsl()] : [])],
	ssr: {
		/**
		 * Bundled for the build, and left alone in development, which is why this
		 * depends on the command.
		 *
		 * Building: Vite keeps CommonJS dependencies external, which assumes a
		 * `node_modules` beside the built server. The Docker image copies `build/` and
		 * nothing else, so an external import is missing there.
		 *
		 * Developing: Vite's module runner is ESM only, so inlining a CommonJS package
		 * hands its `require` to a runtime that has none.
		 */
		noExternal:
			command === 'build'
				? [
						'ws',
						// The MCP client and everything under it, named one by one: inlining a package
						// does not inline what it imports, so leaving `zod` external puts the same
						// missing module back one level down.
						'@modelcontextprotocol/client',
						'@modelcontextprotocol/core',
						'zod',
						'jose',
						'cross-spawn',
						'eventsource',
						'eventsource-parser',
						'pkce-challenge'
					]
				: []
	},
	preview: {
		// Every host in preview mode, with the allowed list from the environment.
		allowedHosts: process.env.VITE_ALLOWED_HOSTS
			? process.env.VITE_ALLOWED_HOSTS.split(',')
			: ['localhost']
	}
}));
