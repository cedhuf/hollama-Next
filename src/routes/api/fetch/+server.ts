import { error, json } from '@sveltejs/kit';

import { env as privateEnv } from '$env/dynamic/private';
import { requireUser } from '$lib/server/api';
import { getSettings } from '$lib/server/db/collections';
import { fetchPage, FetchPageError, type FetchedPage } from '$lib/server/fetchPage';
import { resolveTools } from '$lib/server/toolsResolver';

/** Optional allow-list, mirroring `PROXY_ALLOWED_ORIGINS`. Empty = any public host. */
const allowedOrigins = () =>
	(privateEnv.FETCH_ALLOWED_ORIGINS ?? '')
		.split(',')
		.map((origin) => origin.trim())
		.filter(Boolean);

/**
 * Reads the pages the caller asks for and returns their text.
 *
 * The admin policy is applied *here*, not in the interface: a tool switched off
 * for an instance can't be reached by calling the endpoint directly.
 */
export async function POST(event) {
	const user = await requireUser(event);
	const tools = resolveTools(getSettings(user.id), user.role === 'admin');
	if (!tools.webFetch) throw error(403, 'Web fetch is disabled on this instance');
	const limits = { maxPages: tools.maxPages, maxChars: tools.maxChars };

	const body = await event.request.json().catch(() => null);
	const urls: unknown = body?.urls;
	if (!Array.isArray(urls) || !urls.length) throw error(400, 'Expected a non-empty `urls` array');

	const wanted = urls.filter((u): u is string => typeof u === 'string').slice(0, limits.maxPages);
	if (!wanted.length) throw error(400, 'No usable URL');

	// One bad URL shouldn't lose the others: failures come back as entries so the
	// caller can tell the model which page it didn't get.
	const pages = await Promise.all(
		wanted.map(async (url): Promise<FetchedPage | { url: string; error: string }> => {
			try {
				return await fetchPage(url, limits.maxChars, allowedOrigins());
			} catch (e) {
				const message =
					e instanceof FetchPageError
						? e.message
						: e instanceof Error && e.name === 'AbortError'
							? 'Timed out'
							: 'Could not be read';
				return { url, error: message };
			}
		})
	);

	return json({ pages });
}
