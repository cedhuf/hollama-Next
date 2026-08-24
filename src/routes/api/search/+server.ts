import { error, json } from '@sveltejs/kit';

import { env as privateEnv } from '$env/dynamic/private';
import { env as publicEnv } from '$env/dynamic/public';
import { requireUser } from '$lib/server/api';
import { getSettings } from '$lib/server/db/collections';
import { webSearch, type SearchTarget } from '$lib/server/search';
import { resolveSearch } from '$lib/server/searchResolver';

export async function GET(event) {
	const envUrl = publicEnv.PUBLIC_SEARCH_URL?.trim();

	let target: SearchTarget;
	if (envUrl) {
		// Env wins everywhere; the token (if any) is server-side only.
		target = {
			url: envUrl,
			backend: publicEnv.PUBLIC_SEARCH_BACKEND?.trim() || 'degoog',
			token: privateEnv.SEARCH_TOKEN?.trim() || ''
		};
	} else {
		// Otherwise from the database: what the admin shares, and the user's own
		// override on top of it.
		const user = await requireUser(event);
		const resolved = resolveSearch(getSettings(user.id), user.role === 'admin');
		target = { url: resolved.url, backend: resolved.backend, token: resolved.token };
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
