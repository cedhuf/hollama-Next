import { readdir, readFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';

/**
 * The API surface, read from the routes themselves.
 *
 * Shared by `check-api-docs.mjs` and by the seeding of `docs/openapi.yaml`, so
 * the documented surface and the checked surface can never be derived
 * differently: a checker that disagrees with the generator is worse than none.
 */

const API_ROOT = 'src/routes/api';
const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];

/**
 * SvelteKit's parameter syntax to OpenAPI's.
 *
 * `[id]` is a path parameter. `[...path]` is a catch-all, and OpenAPI has no
 * wildcard, so it becomes a single `{path}` parameter documented as possibly
 * containing slashes. That is a lossy but honest mapping: the alternative is
 * leaving the two proxy routes out of the spec entirely.
 */
function toOpenApiPath(routeDir) {
	const segments = relative(API_ROOT, routeDir).split(sep).filter(Boolean);
	const mapped = segments.map((segment) =>
		segment.replace(/^\[\.{3}(.+)\]$/, '{$1}').replace(/^\[(.+)\]$/, '{$1}')
	);
	return `/api${mapped.length ? `/${mapped.join('/')}` : ''}`;
}

async function* walk(dir) {
	for (const entry of await readdir(dir, { withFileTypes: true })) {
		const full = join(dir, entry.name);
		if (entry.isDirectory()) yield* walk(full);
		else if (entry.name === '+server.ts') yield full;
	}
}

/**
 * Every endpoint the app actually serves: `{ path, methods, file }`, sorted by
 * path so output is stable across machines.
 */
export async function readApiRoutes() {
	const routes = [];

	for await (const file of walk(API_ROOT)) {
		const source = await readFile(file, 'utf8');
		const methods = METHODS.filter((method) =>
			// `export async function GET(` and `export const GET =` are both used in
			// the codebase, and a name only counts at the start of a line so that a
			// mention inside a comment or a string is not read as an export.
			new RegExp(
				`^export\\s+(?:async\\s+)?(?:function\\s+${method}\\b|const\\s+${method}\\s*[=:])`,
				'm'
			).test(source)
		);
		if (!methods.length) continue;
		routes.push({
			path: toOpenApiPath(file.slice(0, -'/+server.ts'.length)),
			methods,
			file
		});
	}

	return routes.sort((a, b) => a.path.localeCompare(b.path));
}
