import type { BundleAvatar } from '$lib/personaBundle';

/**
 * The contract of the persona store: its address and the shape of its listing.
 *
 * Its own module because both sides of the app read it. The browser needs it to
 * draw and filter the catalogue, and the server route that fetches on an
 * instance's behalf needs the address. Neither should have to import the other's
 * machinery to get at a constant, which is the same reason `data/keys` exists.
 *
 * Nothing here touches a store or the browser, so it is safe to import anywhere.
 */

/**
 * Where the personas live.
 *
 * Served from the documentation site, which is published from this repository
 * and already sits behind a domain of ours. Moving the store to a repository of
 * its own later changes this line and nothing else: every path in the listing is
 * relative to this address, so no installed persona and no cached listing has to
 * be migrated.
 */
export const DEFAULT_PERSONA_STORE = 'https://llooma.eu/personas/';

/** Where a persona came from, as the listing declares it. */
export type CatalogOrigin = 'official' | 'community';

/**
 * One row of the listing: enough to draw a card and to filter on, and no more.
 *
 * The prompt, the greeting and any attached documents are deliberately absent.
 * They are the bulk of a persona and are wanted only by whoever installs it,
 * which is one at a time rather than all at once. A listing has to stay cheap
 * with a thousand entries in it; a listing carrying a thousand prompts does not.
 */
export interface CatalogEntry {
	id: string;
	name: string;
	tagline: string;
	avatar: BundleAvatar;
	/** BCP 47. What the persona speaks. */
	locale: string;
	tags: string[];
	author?: string;
	revision: number;
	origin: CatalogOrigin;
	/** Relative to the store's address. */
	path: string;
}

export interface Catalog {
	entries: CatalogEntry[];
	/** When the entries were fetched, or read back from the cache. */
	fetchedAt: string;
}

/**
 * A path is joined onto the store's address, so one that escaped it would let a
 * listing point the app anywhere. It cannot be absolute and it cannot climb.
 */
export function isSafeCatalogPath(path: string): boolean {
	return !!path && !path.includes('..') && !path.includes('://') && !path.startsWith('/');
}

function parseEntry(value: unknown): CatalogEntry | undefined {
	if (!value || typeof value !== 'object') return undefined;
	const o = value as Record<string, unknown>;
	const id = typeof o.id === 'string' ? o.id : '';
	const name = typeof o.name === 'string' ? o.name : '';
	const path = typeof o.path === 'string' ? o.path : '';
	if (!id || !name || !isSafeCatalogPath(path)) return undefined;

	const avatar = o.avatar as BundleAvatar | undefined;
	if (!avatar || typeof avatar !== 'object') return undefined;

	return {
		id,
		name,
		tagline: typeof o.tagline === 'string' ? o.tagline : '',
		avatar,
		locale: typeof o.locale === 'string' ? o.locale : 'en',
		tags: Array.isArray(o.tags) ? o.tags.filter((t): t is string => typeof t === 'string') : [],
		author: typeof o.author === 'string' ? o.author : undefined,
		revision: typeof o.revision === 'number' ? o.revision : 1,
		origin: o.origin === 'community' ? 'community' : 'official',
		path
	};
}

/** Read a listing out of parsed JSON, dropping any row that does not describe a persona. */
export function parseCatalogIndex(json: unknown): CatalogEntry[] | undefined {
	if (!json || typeof json !== 'object') return undefined;
	const o = json as Record<string, unknown>;
	if (o.format !== 'llooma.personas' || !Array.isArray(o.entries)) return undefined;
	return o.entries.map(parseEntry).filter((e): e is CatalogEntry => !!e);
}
