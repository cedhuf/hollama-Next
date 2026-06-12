export interface SearchResult {
	title: string;
	url: string;
	snippet: string;
}

export interface SearchTarget {
	url: string;
	backend: string;
	/** Optional bearer token for protected degoog / SearXNG instances. */
	token?: string;
}

/**
 * Query a search backend and return normalized results. Supports degoog
 * (`/api/search`, default) and SearXNG (`/search?format=json`); both return a
 * `results` array, so we just map the snippet field.
 */
export async function webSearch(
	query: string,
	target: SearchTarget,
	limit = 5
): Promise<SearchResult[]> {
	const base = target.url.replace(/\/+$/, '');
	if (!base || !query.trim()) return [];

	const url =
		target.backend === 'searxng'
			? `${base}/search?q=${encodeURIComponent(query)}&format=json`
			: `${base}/api/search?q=${encodeURIComponent(query)}`;

	const headers: Record<string, string> = { accept: 'application/json' };
	if (target.token) headers.authorization = `Bearer ${target.token}`;

	const response = await fetch(url, { headers });
	if (!response.ok) throw new Error(`Search HTTP ${response.status}`);

	const data = await response.json();
	const results: Record<string, unknown>[] = Array.isArray(data?.results) ? data.results : [];
	return results
		.slice(0, limit)
		.map((r) => ({
			title: String(r.title ?? ''),
			url: String(r.url ?? ''),
			snippet: String(r.snippet ?? r.content ?? r.description ?? '')
		}))
		.filter((r) => r.url);
}
