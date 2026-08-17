#!/usr/bin/env node
/**
 * Put the stores where the documentation site will serve them.
 *
 * A store is a folder at the root of this repository, and the site is the only
 * thing this repository already publishes, so the site is what hosts them:
 * `docs/public` is served at the root of the domain, which makes their public
 * addresses `https://llooma.eu/personas/` and `https://llooma.eu/playbooks/`.
 *
 * A copy rather than a folder written in place, because the two have different
 * jobs. `personas/` and `playbooks/` are the sources, reviewed in pull requests
 * and destined to move to a repository of their own; what lands under
 * `docs/public/` is a build output, ignored by git for the same reason `dist/`
 * is.
 *
 * Run by the docs `dev` and `build` scripts rather than by CI alone, so what you
 * preview locally is what gets published.
 */
import { cpSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

for (const store of ['personas', 'playbooks']) {
	const from = fileURLToPath(new URL(`../${store}/`, import.meta.url));
	const to = fileURLToPath(new URL(`../docs/public/${store}/`, import.meta.url));

	rmSync(to, { recursive: true, force: true });
	cpSync(from, to, {
		recursive: true,
		// The README explains the format to whoever writes one. It is not part of
		// what the app reads, and the site has its own page for readers.
		filter: (path) => !path.endsWith('README.md')
	});

	console.log(`Copied ${store}/ into docs/public/${store}/`);
}
