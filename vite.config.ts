import { sveltekit } from '@sveltejs/kit/vite';
import basicSsl from '@vitejs/plugin-basic-ssl';
import { defineConfig, type Plugin, type ViteDevServer } from 'vite';

/**
 * TLS on the dev server, for testing on a real phone.
 *
 * Opt-in, through `pnpm dev:mobile`, and off everywhere else on purpose. It is
 * not a preference: the microphone is unreachable without it. Browsers hand out
 * `navigator.mediaDevices` only in a secure context, and a secure context is
 * https or `localhost` and nothing else, so a phone pointed at
 * `http://192.168.x.x:5173` has no `mediaDevices` object at all. The access
 * throws, the app catches it beside a refused permission, and what you read is
 * "no microphone, or permission refused" on a device whose microphone is fine.
 *
 * The certificate is self-signed, so Safari objects the first time and you tell
 * it to go ahead. That is enough: once you are through, the origin is secure,
 * which is the whole point. What it is not enough for is a service worker, which
 * refuses an untrusted certificate outright. That costs nothing in development,
 * where the worker is not registered anyway, and it does mean the installed PWA
 * is not what this lets you test. For that, a locally trusted certificate
 * (`mkcert`, with its root installed on the phone) is the next step up.
 *
 * Left off by default because turning it on has a price on the desktop too: the
 * same warning to click through, on every browser profile, for a machine where
 * `localhost` was already secure and already worked.
 */
const httpsRequested = process.env.HTTPS === '1';

/**
 * The development half of what `server.js` does in production.
 *
 * Voice mode needs a WebSocket, and SvelteKit has none of its own. The app
 * attaches one from inside its own bundle, because the socket has to share
 * module state with the route that issues its tickets; all either entry does is
 * leave the HTTP server somewhere the app can find it. Same registered symbol on
 * both sides, so neither has to import the other.
 *
 * Vite's own hot-reload socket lives on this same server. Ours adds a listener
 * rather than replacing one, and ignores every upgrade that is not addressed to
 * it, so the two coexist without either knowing about the other.
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
		 * Bundled for the build, and left alone in development.
		 *
		 * The two halves need opposite answers, which is why this depends on the
		 * command rather than being a constant.
		 *
		 * Building: Vite keeps CommonJS dependencies external by default, which
		 * assumes a `node_modules` beside the built server. The Docker image copies
		 * `build/` and nothing else, so an external import there is a module that
		 * resolves on a developer's machine and is missing in the image. Rollup
		 * converts `ws` from CommonJS on the way in, so inlining it works.
		 *
		 * Developing: there is a `node_modules`, and Vite's module runner is ESM
		 * only. Inlining a CommonJS package there hands its `require` to a runtime
		 * that has none, which is a `ReferenceError` on the first request that
		 * touches it. Left external, Node resolves it itself and it simply works.
		 */
		noExternal:
			command === 'build'
				? [
						'ws',
						// The MCP client and everything under it. Named one by one rather
						// than by a pattern, because inlining a package does not inline what
						// it imports: leaving `zod` or `eventsource` external puts the same
						// missing module back, one level down, and the failure looks
						// identical.
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
		// Allow all hosts in preview mode
		host: true,
		// Use environment variable for allowed hosts, falling back to localhost
		allowedHosts: process.env.VITE_ALLOWED_HOSTS
			? process.env.VITE_ALLOWED_HOSTS.split(',')
			: ['localhost']
	}
}));
