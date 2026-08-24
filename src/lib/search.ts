import { derived, writable } from 'svelte/store';

import { env } from '$env/dynamic/public';

const envUrl = env.PUBLIC_SEARCH_URL?.trim() || '';
const envBackend = env.PUBLIC_SEARCH_BACKEND?.trim() || 'degoog';

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

// The resolved config comes from the server, which is where admin sharing lives.
const serverSearch = writable<Omit<SearchView, 'available'> | null>(null);

export async function loadServerSearch(): Promise<void> {
	if (envUrl) return;
	try {
		const response = await fetch('/api/search/config');
		if (response.ok) serverSearch.set(await response.json());
	} catch {
		/* leave null */
	}
}

/** The effective, reactive search config for the current user. */
export const searchConfig = derived(serverSearch, ($server): SearchView => {
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
});

/**
 * What the router came back with.
 *
 * Three outcomes, not two. `none` is the router doing its job and declining;
 * `unreadable` is the router failing to answer the question it was asked. They
 * used to be the same value, and the caller could only treat both as "don't
 * search", which meant a model whose reply we couldn't parse silently disabled
 * web search for that message, and then got told it had chosen not to look
 * anything up. Keeping them apart lets the caller fall back instead.
 */
export type RouterDecision =
	{ kind: 'query'; query: string } | { kind: 'none' } | { kind: 'unreadable' };

/**
 * Read the router's reply.
 *
 * The router is the chat model itself, told to answer with a query or with NONE.
 * A small model handed the recent turns sometimes forgets the job and simply
 * carries on the conversation, and its reply was being searched verbatim: an
 * instance of this turned "Excellent choix ! C'est un plat complet…" into a web
 * search. So anything that reads as prose is refused rather than searched: a
 * search on prose is worse than no search at all, it feeds the model five
 * irrelevant results and invites it to use them.
 *
 * Refused is not the same as declined, though, which is what `unreadable` is for.
 */
export function parseRouterDecision(raw: string | undefined): RouterDecision {
	// Only the first line: a model that explains itself does so underneath. Its
	// reasoning, which used to land here and read as prose, is stripped upstream by
	// `complete()`.
	const first = (raw ?? '')
		.split('\n')[0]
		.trim()
		.replace(/^["']+|["']+$/g, '');

	if (!first) return { kind: 'unreadable' };
	if (/^none\b/i.test(first)) return { kind: 'none' };

	// Prose tells: it was written for a reader, not for a search engine.
	if (first.length > 120) return { kind: 'unreadable' };
	if (first.split(/\s+/).length > 15) return { kind: 'unreadable' };
	if (/[*_`#|<>]|\.\.\.|…/.test(first)) return { kind: 'unreadable' };
	if (/[.!?:;]$/.test(first)) return { kind: 'unreadable' };

	return { kind: 'query', query: first };
}
