import { readFile } from 'node:fs/promises';
import { parse } from 'yaml';

import { readApiRoutes } from './api-routes.mjs';

/**
 * Fails when the API and its OpenAPI spec have drifted apart.
 *
 * This checks the *surface*, which endpoints exist and which methods they
 * answer, not the shape of what they send back. It cannot tell you a response
 * field was renamed. What it does catch is the failure that actually happens:
 * an endpoint added, moved or deleted, and nobody updated the spec.
 *
 * Run with `--list` to print the routes as the checker sees them, which is also
 * how new entries get their exact path and methods.
 */

const SPEC = 'docs/openapi.yaml';

/**
 * A path item holds operations *and* keys like `parameters`, `summary` and
 * `$ref`. Only the verbs are operations, so only they get compared.
 */
const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options', 'trace'];

const routes = await readApiRoutes();

if (process.argv.includes('--list')) {
	for (const route of routes) console.log(`${route.methods.join(' ')}\t${route.path}`);
	process.exit(0);
}

const spec = parse(await readFile(SPEC, 'utf8'));
const documented = spec?.paths ?? {};
const problems = [];

for (const route of routes) {
	const entry = documented[route.path];
	if (!entry) {
		problems.push(`undocumented endpoint: ${route.path}  (${route.file})`);
		continue;
	}
	for (const method of route.methods) {
		if (!entry[method.toLowerCase()]) {
			problems.push(`undocumented method: ${method} ${route.path}  (${route.file})`);
		}
	}
	for (const method of Object.keys(entry).filter((key) => HTTP_METHODS.includes(key))) {
		if (!route.methods.includes(method.toUpperCase())) {
			problems.push(`documented but not served: ${method.toUpperCase()} ${route.path}`);
		}
	}
}

for (const path of Object.keys(documented)) {
	if (!routes.some((route) => route.path === path)) {
		problems.push(`documented but no such route: ${path}`);
	}
}

if (problems.length) {
	console.error(`${SPEC} is out of date with the routes:\n`);
	for (const problem of problems) console.error(`  - ${problem}`);
	console.error(`\nRun \`node scripts/check-api-docs.mjs --list\` to see the routes as they are.`);
	process.exit(1);
}

console.log(`${SPEC} matches all ${routes.length} API routes.`);
