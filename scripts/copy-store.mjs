#!/usr/bin/env node
/**
 * Put the stores where the documentation site will serve them. `docs/public` is
 * served at the root of the domain, making the store's address
 * `https://llooma.eu/store/`.
 *
 * A copy rather than a folder written in place: `store/` is the source and
 * `docs/public/store/` is a build output. Run by the docs `dev` and `build`
 * scripts, so what you preview locally is what gets published.
 */
import { cpSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const from = fileURLToPath(new URL('../store/', import.meta.url));
const to = fileURLToPath(new URL('../docs/public/store/', import.meta.url));

rmSync(to, { recursive: true, force: true });
cpSync(from, to, {
	recursive: true,
	// The READMEs explain the formats to whoever writes one. They are not part of
	// what the app reads, and the site has its own page for readers.
	filter: (path) => !path.endsWith('README.md')
});

console.log('Copied store/ into docs/public/store/');
