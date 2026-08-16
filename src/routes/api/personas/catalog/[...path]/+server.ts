import { error } from '@sveltejs/kit';

import { env as privateEnv } from '$env/dynamic/private';
import { DEFAULT_PERSONA_STORE, isSafeCatalogPath } from '$lib/personaStore';
import { requireUser } from '$lib/server/api';
import { personaStoreUrl } from '$lib/server/db/config';

/**
 * The persona store, read by the instance rather than by each browser.
 *
 * Three things this buys, and none of them are available to a `fetch` from the
 * page. One machine holds the listing for everyone on the instance, so a hundred
 * users cost one request rather than a hundred. An instance whose browsers have
 * no way out can still be given a store, because only the server has to reach
 * it. And the address is the administrator's, set in the admin panel or in the
 * environment, rather than a preference each person would have to know to change.
 *
 * A pass-through, deliberately: no parsing, no rewriting. The listing and the
 * bundles are validated where they are used, which is the client, and doing it
 * twice would mean two shapes to keep in step.
 */
/**
 * The admin's address, then the environment's, then ours.
 *
 * The panel wins over the variable rather than the reverse: a variable is what a
 * deployment sets once, and an administrator changing it in the interface and
 * finding it ignored would have no way of telling why.
 */
function store(): string {
	const url = personaStoreUrl() || privateEnv.PERSONA_STORE_URL || DEFAULT_PERSONA_STORE;
	return url.replace(/\/*$/, '/');
}

/**
 * How long a fetched file is held.
 *
 * The store changes when someone lands a pull request against it, so minutes-old
 * is fine and an hour is not noticeable. What this really protects against is a
 * page that re-reads the listing every time it opens.
 */
const TTL_MS = 15 * 60 * 1000;

// Keyed by the full address, not the path: pointing the instance at another store
// otherwise keeps serving the previous one's files until the entries expire.
const cache = new Map<string, { body: string; type: string; at: number }>();

export async function GET(event) {
	await requireUser(event);

	// The path is joined onto the store's address, so anything that could climb out
	// of it would turn this route into an open proxy.
	const path = event.params.path;
	if (!isSafeCatalogPath(path)) throw error(400, 'Bad catalog path');

	const url = `${store()}${path}`;
	const hit = cache.get(url);
	if (hit && Date.now() - hit.at < TTL_MS) {
		return new Response(hit.body, { headers: { 'content-type': hit.type } });
	}

	let response: Response;
	try {
		response = await fetch(url, { headers: { accept: 'application/json' } });
	} catch {
		// The store is somewhere else and may simply be unreachable. A held copy,
		// however old, beats an error: the alternative is an empty library.
		if (hit) return new Response(hit.body, { headers: { 'content-type': hit.type } });
		throw error(502, 'The persona store could not be reached');
	}

	if (!response.ok) {
		if (hit) return new Response(hit.body, { headers: { 'content-type': hit.type } });
		throw error(response.status === 404 ? 404 : 502, 'The persona store answered with an error');
	}

	const body = await response.text();
	const type = response.headers.get('content-type') ?? 'application/json';
	cache.set(url, { body, type, at: Date.now() });

	return new Response(body, { headers: { 'content-type': type } });
}
