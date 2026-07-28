#!/usr/bin/env node
/**
 * Translation coverage report.
 *
 * `en/` is the source of truth: every key lives there. Other locales extend it
 * via `extendDictionary`, so a missing key is never an error — it just renders in
 * English. That keeps adding a key cheap (touch `en/` only), but it also makes
 * gaps invisible, which is what this script surfaces.
 *
 * Exits non-zero only when a locale declares a key that no longer exists in `en/`
 * (a stale override, usually a rename left behind) — that one is a real bug.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const I18N_DIR = new URL('../src/i18n/', import.meta.url).pathname;
const BASE = 'en';

/** Top-level keys of a locale module, read straight from the source text. */
function keysOf(locale) {
	const source = readFileSync(join(I18N_DIR, locale, 'index.ts'), 'utf8');
	return new Set([...source.matchAll(/^\t([a-zA-Z][a-zA-Z0-9_]*)\s*:/gm)].map((m) => m[1]));
}

const locales = readdirSync(I18N_DIR).filter((entry) => {
	try {
		return statSync(join(I18N_DIR, entry)).isDirectory();
	} catch {
		return false;
	}
});

const baseKeys = keysOf(BASE);
console.log(`Base locale "${BASE}": ${baseKeys.size} keys\n`);

let stale = 0;

for (const locale of locales.filter((l) => l !== BASE).sort()) {
	const keys = keysOf(locale);
	const missing = [...baseKeys].filter((k) => !keys.has(k));
	const orphaned = [...keys].filter((k) => !baseKeys.has(k));
	const done = baseKeys.size - missing.length;
	const percent = Math.round((done / baseKeys.size) * 100);

	console.log(`${locale}: ${done}/${baseKeys.size} (${percent}%)`);

	if (missing.length) {
		console.log(`  ${missing.length} falling back to ${BASE}:`);
		for (const key of missing) console.log(`    ${key}`);
	}
	if (orphaned.length) {
		stale += orphaned.length;
		console.log(`  ${orphaned.length} STALE (not in ${BASE} — rename left behind):`);
		for (const key of orphaned) console.log(`    ${key}`);
	}
	console.log();
}

if (stale) {
	console.error(`${stale} stale key(s) found. Remove them or restore them in ${BASE}/.`);
	process.exit(1);
}
