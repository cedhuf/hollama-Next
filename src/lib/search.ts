import { derived, get, writable } from 'svelte/store';

import { env } from '$env/dynamic/public';
import { settingsStore } from '$lib/localStorage';

const isServer = env.PUBLIC_MODE === 'server';
const envUrl = env.PUBLIC_SEARCH_URL?.trim() || '';
const envBackend = env.PUBLIC_SEARCH_BACKEND?.trim() || 'degoog';

export interface SearchResult {
	title: string;
	url: string;
	snippet: string;
}

export interface SearchView {
	available: boolean;
	editable: boolean;
	source: 'env' | 'admin' | 'user' | 'none';
	url: string;
	backend: string;
	hasToken: boolean;
	adminUrl: string;
	adminBackend: string;
}

// In server mode the resolved config comes from the server (admin sharing).
const serverSearch = writable<Omit<SearchView, 'available'> | null>(null);

export async function loadServerSearch(): Promise<void> {
	if (!isServer || envUrl) return;
	try {
		const response = await fetch('/api/search/config');
		if (response.ok) serverSearch.set(await response.json());
	} catch {
		/* leave null */
	}
}

/** The effective, reactive search config for the current user/mode. */
export const searchConfig = derived(
	[settingsStore, serverSearch],
	([$settings, $server]): SearchView => {
		if (envUrl) {
			return {
				available: true,
				editable: false,
				source: 'env',
				url: envUrl,
				backend: envBackend,
				hasToken: false,
				adminUrl: '',
				adminBackend: ''
			};
		}
		if (isServer) {
			if (!$server) {
				return {
					available: false,
					editable: false,
					source: 'none',
					url: '',
					backend: 'degoog',
					hasToken: false,
					adminUrl: '',
					adminBackend: ''
				};
			}
			return { ...$server, available: !!$server.url };
		}
		// Local mode: the user's own config (localStorage).
		const url = $settings.searchUrl?.trim() || '';
		return {
			available: !!url,
			editable: true,
			source: 'user',
			url,
			backend: $settings.searchBackend || 'degoog',
			hasToken: !!$settings.searchToken,
			adminUrl: '',
			adminBackend: ''
		};
	}
);

export async function searchWeb(query: string): Promise<SearchResult[]> {
	const cfg = get(searchConfig);
	if (!cfg.available) return [];

	const params = new URLSearchParams({ q: query });
	const headers: Record<string, string> = {};
	// Local mode (no env): the config lives in the browser, pass it along. The
	// token goes in a header to keep it out of the URL.
	if (!isServer && !envUrl) {
		params.set('url', cfg.url);
		params.set('backend', cfg.backend);
		const token = get(settingsStore).searchToken;
		if (token) headers['x-search-token'] = token;
	}

	try {
		const response = await fetch(`/api/search?${params}`, { headers });
		if (!response.ok) return [];
		const data = await response.json();
		return Array.isArray(data?.results) ? data.results : [];
	} catch {
		return [];
	}
}

/** Run a search and format the results as a system-context block (always mode). */
export async function buildSearchContext(query: string): Promise<string | null> {
	const results = await searchWeb(query);
	if (!results.length) return null;

	const body = results.map((r, i) => `[${i + 1}] ${r.title}\n${r.url}\n${r.snippet}`).join('\n\n');
	return `Web search results for the user's question (use them to answer accurately and cite sources by their [number] / URL when relevant):\n\n${body}`;
}
