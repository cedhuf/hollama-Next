import { error, json } from '@sveltejs/kit';

import { env as privateEnv } from '$env/dynamic/private';
import { env as publicEnv } from '$env/dynamic/public';
import { requireUser } from '$lib/server/api';
import { getSettings } from '$lib/server/db/collections';
import { webSearch, type SearchTarget } from '$lib/server/search';
import { resolveSearch } from '$lib/server/searchResolver';

export async function GET(event) {
	const isServer = publicEnv.PUBLIC_MODE === 'server';
	const envUrl = publicEnv.PUBLIC_SEARCH_URL?.trim();

	let target: SearchTarget;
	if (envUrl) {
		// Env wins everywhere; the token (if any) is server-side only.
		target = {
			url: envUrl,
			backend: publicEnv.PUBLIC_SEARCH_BACKEND?.trim() || 'degoog',
			token: privateEnv.SEARCH_TOKEN?.trim() || ''
		};
	} else if (isServer) {
		// Server resolves from the DB (admin sharing + the user's own override).
		const user = await requireUser(event);
		const resolved = resolveSearch(getSettings(user.id), user.role === 'admin');
		target = { url: resolved.url, backend: resolved.backend, token: resolved.token };
	} else {
		// Local mode: the user's config lives in the browser (url/backend as query
		// params, token in a header to keep it out of the URL).
		target = {
			url: event.url.searchParams.get('url')?.trim() || '',
			backend: event.url.searchParams.get('backend')?.trim() || 'degoog',
			token: event.request.headers.get('x-search-token') || ''
		};
	}

	if (!target.url) throw error(503, 'Web search is not configured');

	const query = event.url.searchParams.get('q') ?? '';
	if (!query.trim()) return json({ results: [] });

	try {
		return json({ results: await webSearch(query, target) });
	} catch (e) {
		throw error(502, e instanceof Error ? e.message : 'Search failed');
	}
}
