#!/usr/bin/env node
/**
 * Put the stores where the documentation site will serve them.
 *
 * The store is a folder at the root of this repository, and the site is the only
 * thing this repository already publishes, so the site is what hosts it:
 * `docs/public` is served at the root of the domain, which makes the store's
 * public address `https://llooma.eu/store/`, with a folder under it per kind.
 *
 * A copy rather than a folder written in place, because the two have different
 * jobs. `store/` is the source, reviewed in pull requests and destined to move
 * to a repository of its own; `docs/public/store/` is a build output, ignored by
 * git for the same reason `dist/` is.
 *
 * Run by the docs `dev` and `build` scripts rather than by CI alone, so what you
 * preview locally is what gets published.
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
