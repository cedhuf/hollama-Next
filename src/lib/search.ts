import { derived, get, writable } from 'svelte/store';

import { env } from '$env/dynamic/public';
import { resolvePrompt } from '$lib/defaultPrompts';
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

/**
 * The query the router asked for — or nothing, when it didn't route.
 *
 * The router is the chat model itself, told to answer with a query or with NONE.
 * A small model handed the recent turns sometimes forgets the job and simply
 * carries on the conversation, and its reply was being searched verbatim: an
 * instance of this turned "Excellent choix ! C'est un plat complet…" into a web
 * search. Anything that doesn't look like a query is treated as NONE, because a
 * search on prose is worse than no search at all — it feeds the model five
 * irrelevant results and invites it to use them.
 */
export function parseRouterDecision(raw: string | undefined): string | null {
	// Only the first line: a model that explains itself does so underneath.
	const first = (raw ?? '')
		.split('\n')[0]
		.trim()
		.replace(/^["']+|["']+$/g, '');
	if (!first || /^none\b/i.test(first)) return null;

	// Prose tells: it was written for a reader, not for a search engine.
	if (first.length > 120) return null;
	if (first.split(/\s+/).length > 15) return null;
	if (/[*_`#|<>]|\.\.\.|…/.test(first)) return null;
	if (/[.!?:;]$/.test(first)) return null;

	return first;
}

export interface SearchContext {
	context: string;
	query: string;
	resultCount: number;
	results: SearchResult[];
}

/** Run a search and format the results as a system-context block (always mode). */
export async function buildSearchContext(query: string): Promise<SearchContext | null> {
	const results = await searchWeb(query);
	if (!results.length) return null;

	const body = results.map((r, i) => `[${i + 1}] ${r.title}\n${r.url}\n${r.snippet}`).join('\n\n');
	return {
		context: resolvePrompt('searchContext', get(settingsStore).promptOverrides, { results: body }),
		query,
		resultCount: results.length,
		results
	};
}
