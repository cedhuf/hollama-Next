import { error } from '@sveltejs/kit';

import { isSafeCatalogPath } from '$lib/store';

/**
 * A store, read by the instance rather than by each browser: one machine holds
 * the listing for everyone, an instance whose browsers have no way out can still
 * be given a store, and the address is the administrator's.
 *
 * A pass-through: the listing and the bundles are validated where they are used,
 * and doing it twice would mean two shapes to keep in step.
 */

/** A store changes when someone lands a pull request against it, so minutes-old is fine. What this protects against is a page that re-reads the listing every time it opens. */
const TTL_MS = 15 * 60 * 1000;

// Keyed by the full address, not the path: pointing the instance at another
// store otherwise keeps serving the previous one's files until the entries expire.
const cache = new Map<string, { body: string; type: string; at: number }>();

export async function serveFromStore(options: {
	/** The store's address, trailing slash included. */
	base: string;
	/** The path under it, as the route matched it. */
	path: string | undefined;
	/** Skip the held copy, what the Refresh control asks for. */
	fresh: boolean;
	/** What to call it when something goes wrong, e.g. "persona store". */
	label: string;
}): Promise<Response> {
	const { base, path, fresh, label } = options;

	// The path is joined onto the store's address, so anything that could climb out
	// of it would turn this route into an open proxy.
	if (!isSafeCatalogPath(path ?? '')) throw error(400, 'Bad catalog path');

	const url = `${base}${path}`;
	const hit = cache.get(url);
	if (!fresh && hit && Date.now() - hit.at < TTL_MS) {
		return new Response(hit.body, { headers: { 'content-type': hit.type } });
	}

	let response: Response;
	try {
		response = await fetch(url, { headers: { accept: 'application/json' } });
	} catch {
		// The store is somewhere else and may be unreachable. A held copy, however old,
		// beats an error: the alternative is an empty library.
		if (hit) return new Response(hit.body, { headers: { 'content-type': hit.type } });
		throw error(502, `The ${label} could not be reached`);
	}

	if (!response.ok) {
		if (hit) return new Response(hit.body, { headers: { 'content-type': hit.type } });
		throw error(response.status === 404 ? 404 : 502, `The ${label} answered with an error`);
	}

	const body = await response.text();
	const type = response.headers.get('content-type') ?? 'application/json';
	cache.set(url, { body, type, at: Date.now() });

	return new Response(body, { headers: { 'content-type': type } });
}
