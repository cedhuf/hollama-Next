import { sveltekit } from '@sveltejs/kit/vite';
import basicSsl from '@vitejs/plugin-basic-ssl';
import { defineConfig } from 'vite';

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

export default defineConfig({
	plugins: [sveltekit(), ...(httpsRequested ? [basicSsl()] : [])],
	preview: {
		// Allow all hosts in preview mode
		host: true,
		// Use environment variable for allowed hosts, falling back to localhost
		allowedHosts: process.env.VITE_ALLOWED_HOSTS
			? process.env.VITE_ALLOWED_HOSTS.split(',')
			: ['localhost']
	}
});
