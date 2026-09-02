import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import svelte from 'eslint-plugin-svelte';
import globals from 'globals';
import ts from 'typescript-eslint';

import svelteConfig from './svelte.config.js'; // Assuming this file exists, as per your example

export default ts.config(
	{
		ignores: [
			'**/node_modules/**',
			// The docs site is a separate project with its own toolchain and conventions;
			// linting it with the app's rules reports on code this config never covered.
			'docs/**',
			// Gitignored scratch space: throwaway scripts and reports, not source.
			'_local/**',
			'build/**',
			'.svelte-kit/**',
			// pdf.js, copied out of node_modules by `prepare`. A minified third-party
			// bundle judged by the rules of hand-written code reports about seventeen
			// hundred style errors, which buries every real one.
			'static/vendor/**',
			'package/**',
			'**/.DS_Store',
			'**/.env',
			'**/.env.*', // Note: !.env.example from .eslintignore is not directly translated.
			'**/pnpm-lock.yaml',
			'**/package-lock.json',
			'**/yarn.lock',
			'src/i18n/**', // Ignore auto-generated i18n files
			'postcss.config.cjs', // Ignore postcss.config.cjs
			'tailwind.config.js' // Ignore tailwind.config.js
		]
	},
	js.configs.recommended, // General JS recommendations from @eslint/js
	...ts.configs.recommended, // TypeScript recommendations from typescript-eslint

	// Svelte: the base recommendations, which set up svelte-eslint-parser.
	...svelte.configs.recommended,

	{
		// Parse <script lang="ts"> in .svelte files.
		files: ['**/*.svelte', '**/*.svelte.ts', '**/*.svelte.js'],
		languageOptions: {
			parserOptions: {
				parser: ts.parser, // Tell svelte-eslint-parser to use ts.parser for script content
				projectService: true, // Enable typed linting rules (ensure tsconfig.json is discoverable)
				extraFileExtensions: ['.svelte'], // Crucial for Svelte files
				svelteConfig // Pass svelte.config.js to the parser for richer context
			}
		}
	},

	{
		languageOptions: {
			ecmaVersion: 'latest',
			sourceType: 'module',
			globals: {
				...globals.browser,
				...globals.node
			}
		}
	},

	{
		/**
		 * The audio worklets, which run in a realm of their own.
		 *
		 * Plain JavaScript in `static/` because an `AudioWorklet` is fetched by URL into
		 * a separate global scope: nothing to compile, no import to resolve. That scope
		 * has its own globals, which is what this block is for, and none of the DOM,
		 * which is why `globals.browser` would be wrong rather than generous.
		 */
		files: ['static/worklets/*.js'],
		languageOptions: {
			globals: {
				AudioWorkletProcessor: 'readonly',
				registerProcessor: 'readonly',
				currentFrame: 'readonly',
				currentTime: 'readonly',
				sampleRate: 'readonly'
			}
		}
	},

	// Prettier last, so it overrides the formatting rules above.
	prettier,
	...svelte.configs.prettier
);
