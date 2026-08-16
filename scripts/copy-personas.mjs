#!/usr/bin/env node
/**
 * Put the persona store where the documentation site will serve it.
 *
 * The store is a folder at the root of this repository, and the site is the only
 * thing this repository already publishes, so the site is what hosts it:
 * `docs/public` is served at the root of the domain, which makes the store's
 * public address `https://llooma.eu/personas/`.
 *
 * A copy rather than a folder written in place, because the two have different
 * jobs. `personas/` is the source, reviewed in pull requests and destined to move
 * to a repository of its own; `docs/public/personas/` is a build output, and is
 * ignored by git for the same reason `dist/` is.
 *
 * Run by the docs `dev` and `build` scripts rather than by CI alone, so what you
 * preview locally is what gets published.
 */
import { cpSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const from = fileURLToPath(new URL('../personas/', import.meta.url));
const to = fileURLToPath(new URL('../docs/public/personas/', import.meta.url));

rmSync(to, { recursive: true, force: true });
cpSync(from, to, {
	recursive: true,
	// The README explains the format to whoever writes a persona. It is not part
	// of what the app reads, and the site has its own page for readers.
	filter: (path) => !path.endsWith('README.md')
});

console.log('Copied personas/ into docs/public/personas/');
