#!/usr/bin/env node
/**
 * Put the pdf.js worker where the app can serve it itself.
 *
 * Left alone, the document parser loads this worker from a public CDN the first
 * time someone attaches a PDF. That is a request to a third party from an app
 * whose whole point is that your data stays where you put it, and it breaks
 * outright on an instance with no internet access. Copying it into `static/`
 * means it is served from the same origin as everything else.
 *
 * Runs from `prepare`, so a fresh clone and every install has it. The copy is
 * gitignored: it is a build artifact of a pinned dependency, not source.
 */
import { copyFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const target = join(root, 'static', 'vendor');

try {
	const source = require.resolve('pdfjs-dist/build/pdf.worker.min.mjs');
	mkdirSync(target, { recursive: true });
	copyFileSync(source, join(target, 'pdf.worker.min.mjs'));
} catch (error) {
	// Not fatal: the app builds and runs without it, and says so when a PDF is
	// attached. Failing the install over an optional asset would be worse.
	console.warn(`[pdf worker] not copied: ${error.message}`);
}
