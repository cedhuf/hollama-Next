import adapterNode from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	// Consult https://kit.svelte.dev/docs/integrations#preprocessors
	// for more information about preprocessors
	preprocess: [vitePreprocess({})],

	kit: {
		// Node server output: works for self-hosting (Docker) and Tauri.
		adapter: adapterNode(),
		version: {
			name: process.env.npm_package_version,
			// A self-hosted instance updates under its clients: a PWA or a tab left
			// open for days otherwise keeps running the build it started with, and
			// nothing tells the user. Polling makes `updated` flip on its own; the
			// layout also checks on demand when the app comes back to the foreground.
			pollInterval: 15 * 60 * 1000
		},
		alias: {
			$i18n: 'src/i18n'
		}
	}
};

export default config;
