#!/usr/bin/env node
/**
 * Build the playbook store's index from the bundles beside it.
 *
 * The twin of `build-persona-index.mjs`, and deliberately its own file rather
 * than a flag on it. The two stores share a shape but not a schema: a persona
 * has an avatar and a model, a playbook has a summary and a procedure, and the
 * validation worth having is the validation that knows which one it is reading.
 * What is shared is the part that must not diverge — the digest — and that is
 * imported, not copied.
 */
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// The application's own digest, not a copy of it: written twice it would drift
// once, and every installed playbook would be reported as modified that day. The
// mapping from a playbook's fields onto it lives here rather than in a module
// the browser also loads, because a module importing a `.ts` path is fine for
// Node and not for the type checker — and the mapping is three lines, where the
// hash is the part that must not diverge.
import { contentDigest } from '../src/lib/personaDigest.ts';

const playbookDigest = (playbook) =>
	contentDigest({
		name: playbook.name,
		tagline: playbook.summary,
		avatar: { color: playbook.color, glyph: playbook.glyph },
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
	// The id is what says "this is the playbook you already have" across
	// revisions, so it has to be the file's name too.
	if (bundle.id && `${bundle.id}.json` !== file) {
		problems.push(`${file}: id "${bundle.id}" does not match the file name`);
	}

	entries.push({
		id: bundle.id,
		name: bundle.playbook?.name,
		summary: bundle.playbook?.summary ?? '',
		color: bundle.playbook?.color,
		glyph: bundle.playbook?.glyph,
		tags: bundle.playbook?.tags ?? [],
		author: bundle.author,
		revision: bundle.revision ?? 1,
		origin: ORIGIN,
		path: `bundles/${file}`,
		// The whole procedure is not in the listing, on purpose: it is the bulk of a
		// playbook and only whoever installs one needs it. What is here is enough to
		// draw a card and to say how long the procedure is.
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
