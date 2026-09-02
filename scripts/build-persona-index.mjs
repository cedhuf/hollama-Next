#!/usr/bin/env node
/**
 * Build the persona store's index from the bundles beside it.
 *
 * The app fetches this one file to fill the browser and only fetches a bundle on
 * install: a thousand personas listed is a few dozen kilobytes, a thousand
 * downloaded whole is not something anyone should pay for scrolling a page.
 *
 * Generated and checked in, since by hand it would drift within a week.
 * `pnpm personas:index`, and the CI check below fails the build if it was
 * forgotten.
 */
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// The application's own digest, not a copy: written twice it would drift once,
// and every installed persona would be reported as modified. Node reads
// TypeScript directly, so importing it costs nothing.
import { bundleAuthored, contentDigest } from '../src/lib/personaDigest.ts';

const ROOT = fileURLToPath(new URL('../store/personas/', import.meta.url));
const BUNDLES = join(ROOT, 'bundles');
const INDEX = join(ROOT, 'index.json');

/** Everything in this folder is ours. A community store sets its own. */
const ORIGIN = 'official';

/** A glyph is thirty bytes and belongs here; an uploaded picture is tens of kilobytes of base64, and a hundred of those is an index nobody can load on a phone. Past the limit the listing falls back to initials. */
const MAX_INLINE_AVATAR = 4096;

function indexAvatar(avatar) {
	if (avatar?.kind === 'image' && (avatar.src?.length ?? 0) > MAX_INLINE_AVATAR) {
		return { kind: 'initials', color: avatar.color ?? '#888780' };
	}
	return avatar;
}

/**
 * Two digests, two jobs, and conflating them would break both.
 *
 * `integrity` is SHA-256 over the file's bytes and answers "is this the bundle
 * the store published". It lives in the listing rather than in the file, since a
 * hash of a file cannot be written into that file.
 *
 * `contentDigest` is over the authored fields and answers "is this persona still
 * the one that was published", asked against a persona in someone's library
 * rather than against a file.
 */
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

	if (bundle.format !== 'llooma.persona') {
		problems.push(`${file}: format is not "llooma.persona"`);
		continue;
	}
	if (!bundle.id) problems.push(`${file}: missing "id"`);
	if (!bundle.persona?.name) problems.push(`${file}: missing "persona.name"`);
	if (!bundle.persona?.avatar) problems.push(`${file}: missing "persona.avatar"`);
	// The id is what says "this is the Pixel you already have" across revisions, so
	// it has to be the file's name too.
	if (bundle.id && `${bundle.id}.json` !== file) {
		problems.push(`${file}: id "${bundle.id}" does not match the file name`);
	}

	entries.push({
		id: bundle.id,
		name: bundle.persona?.name,
		tagline: bundle.persona?.tagline ?? '',
		avatar: indexAvatar(bundle.persona?.avatar),
		tags: bundle.persona?.tags ?? [],
		author: bundle.author,
		revision: bundle.revision ?? 1,
		origin: ORIGIN,
		path: `bundles/${file}`,
		integrity: `sha256-${createHash('sha256').update(raw).digest('base64')}`,
		contentDigest: contentDigest(bundleAuthored(bundle))
	});
}

if (problems.length) {
	console.error('Persona bundles are not valid:\n' + problems.map((p) => `  - ${p}`).join('\n'));
	process.exit(1);
}

const index = JSON.stringify({ format: 'llooma.personas', version: 1, entries }, null, '\t') + '\n';

// `--check` is for CI: it says whether the committed index still describes the
// bundles, without writing anything.
if (process.argv.includes('--check')) {
	const current = readFileSync(INDEX, 'utf8');
	if (current !== index) {
		console.error('store/personas/index.json is out of date. Run `pnpm personas:index`.');
		process.exit(1);
	}
	console.log(`store/personas/index.json is up to date (${entries.length} personas).`);
} else {
	writeFileSync(INDEX, index);
	console.log(`Wrote store/personas/index.json (${entries.length} personas).`);
}
