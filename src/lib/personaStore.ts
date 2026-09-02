import type { BundleAvatar } from '$lib/personaBundle';
import { isSafeCatalogPath } from '$lib/store';

/**
 * The shape of the persona catalogue's listing. Its own module because both
 * sides of the app read it; the address lives in `store`.
 *
 * Nothing here touches a store or the browser, so it is safe to import anywhere.
 */

/** Where a persona came from, as the listing declares it. */
export type CatalogOrigin = 'official' | 'community';

/**
 * One row: enough to draw a card and filter on. The prompt, the greeting and any
 * attached documents are absent, being the bulk of a persona and wanted only by
 * whoever installs it. A listing has to stay cheap with a thousand entries.
 */
export interface CatalogEntry {
	id: string;
	name: string;
	tagline: string;
	avatar: BundleAvatar;
	tags: string[];
	author?: string;
	revision: number;
	origin: CatalogOrigin;
	/** Relative to the store's address. */
	path: string;
	/**
	 * `sha256-<base64>` over the bundle's bytes, as npm records a package's. Not
	 * inside the bundle, since a file cannot contain its own hash, and not a defence
	 * against the store: whoever can serve a bad bundle can serve a bad listing. It
	 * catches a drifted mirror, a rotted cache, and a bundle edited without the
	 * listing being rebuilt.
	 */
	integrity?: string;
	/** Here as well as in the bundle's fields, so "you have edited this" and "the store has moved on" can be read from the listing without downloading anything. */
	contentDigest?: string;
}

export interface Catalog {
	entries: CatalogEntry[];
	/** When the entries were fetched, or read back from the cache. */
	fetchedAt: string;
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
		tags: Array.isArray(o.tags) ? o.tags.filter((t): t is string => typeof t === 'string') : [],
		author: typeof o.author === 'string' ? o.author : undefined,
		revision: typeof o.revision === 'number' ? o.revision : 1,
		origin: o.origin === 'community' ? 'community' : 'official',
		path,
		integrity: typeof o.integrity === 'string' ? o.integrity : undefined,
		contentDigest: typeof o.contentDigest === 'string' ? o.contentDigest : undefined
	};
}

/** Read a listing out of parsed JSON, dropping any row that does not describe a persona. */
export function parseCatalogIndex(json: unknown): CatalogEntry[] | undefined {
	if (!json || typeof json !== 'object') return undefined;
	const o = json as Record<string, unknown>;
	if (o.format !== 'llooma.personas' || !Array.isArray(o.entries)) return undefined;
	return o.entries.map(parseEntry).filter((e): e is CatalogEntry => !!e);
}
