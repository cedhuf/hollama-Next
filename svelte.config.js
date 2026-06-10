import adapterNode from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	// Consult https://kit.svelte.dev/docs/integrations#preprocessors
	// for more information about preprocessors
	preprocess: [vitePreprocess({})],

	kit: {
		// Node server output — works for self-hosting (Docker) and Tauri.
		adapter: adapterNode(),
		version: {
			name: process.env.npm_package_version
		},
		alias: {
			$i18n: 'src/i18n'
		}
	}
};

export default config;
