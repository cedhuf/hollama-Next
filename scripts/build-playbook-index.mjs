#!/usr/bin/env node
/**
 * Build the playbook store's index from the bundles beside it.
 *
 * The twin of `build-persona-index.mjs`, and its own file rather than a flag on
 * it: the two stores share a shape but not a schema, and the validation worth
 * having is the one that knows which it is reading. What is shared is the
 * digest, and that is imported rather than copied.
 */
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// The application's own digest, not a copy: written twice it would drift once.
// The mapping from a playbook's fields onto it lives here rather than in a
// module the browser also loads, because importing a `.ts` path is fine for Node
// and not for the type checker.
import { contentDigest } from '../src/lib/personaDigest.ts';

const playbookDigest = (playbook) =>
	contentDigest({
		name: playbook.name,
		tagline: playbook.summary,
		// A playbook has no avatar. The slot stays because the shared hash walks a fixed
		// list of fields.
		avatar: {},
		systemPrompt: playbook.instructions,
		tags: playbook.tags
	});

const ROOT = fileURLToPath(new URL('../store/playbooks/', import.meta.url));
const BUNDLES = join(ROOT, 'bundles');
const INDEX = join(ROOT, 'index.json');

/** Everything in this folder is ours. A community store sets its own. */
const ORIGIN = 'official';

const entries = [];
const problems = [];

for (const file of readdirSync(BUNDLES)
	.filter((f) => f.endsWith('.json'))
	.sort()) {
	const path = join(BUNDLES, file);
	let bundle;
	let raw;
	try {
		raw = readFileSync(path);
		bundle = JSON.parse(raw.toString('utf8'));
	} catch (error) {
		problems.push(`${file}: not valid JSON (${error.message})`);
		continue;
	}

	if (bundle.format !== 'llooma.playbook') {
		problems.push(`${file}: format is not "llooma.playbook"`);
		continue;
	}
	if (!bundle.id) problems.push(`${file}: missing "id"`);
	if (!bundle.playbook?.name) problems.push(`${file}: missing "playbook.name"`);
	if (!bundle.playbook?.summary) problems.push(`${file}: missing "playbook.summary"`);
	if (!bundle.playbook?.instructions) problems.push(`${file}: missing "playbook.instructions"`);
	// The id is what says "this is the playbook you already have" across revisions,
	// so it has to be the file's name too.
	if (bundle.id && `${bundle.id}.json` !== file) {
		problems.push(`${file}: id "${bundle.id}" does not match the file name`);
	}

	entries.push({
		id: bundle.id,
		name: bundle.playbook?.name,
		summary: bundle.playbook?.summary ?? '',
		tags: bundle.playbook?.tags ?? [],
		author: bundle.author,
		revision: bundle.revision ?? 1,
		origin: ORIGIN,
		path: `bundles/${file}`,
		// The whole procedure is not in the listing, on purpose: it is the bulk of a
		// playbook and only whoever installs one needs it.
		steps: (bundle.playbook?.instructions?.match(/^#{1,6}\s+\S/gm) ?? []).length,
		integrity: `sha256-${createHash('sha256').update(raw).digest('base64')}`,
		contentDigest: playbookDigest(bundle.playbook)
	});
}

if (problems.length) {
	console.error('Playbook bundles are not valid:\n' + problems.map((p) => `  - ${p}`).join('\n'));
	process.exit(1);
}

const index =
	JSON.stringify({ format: 'llooma.playbooks', version: 1, entries }, null, '\t') + '\n';

if (process.argv.includes('--check')) {
	const current = readFileSync(INDEX, 'utf8');
	if (current !== index) {
		console.error('store/playbooks/index.json is out of date. Run `pnpm playbooks:index`.');
		process.exit(1);
	}
	console.log(`store/playbooks/index.json is up to date (${entries.length} playbooks).`);
} else {
	writeFileSync(INDEX, index);
	console.log(`Wrote store/playbooks/index.json (${entries.length} playbooks).`);
}
