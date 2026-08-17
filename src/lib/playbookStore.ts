/**
 * The contract of the playbook store: its address and the shape of its listing.
 *
 * Its own module because both sides of the app read it, the same reason
 * `personaStore` exists. Nothing here touches a store or the browser, so it is
 * safe to import anywhere.
 */

/**
 * Where the playbooks live.
 *
 * Served from the documentation site, which is published from this repository
 * and already sits behind a domain of ours. Moving the store to a repository of
 * its own later changes this line and nothing else: every path in the listing is
 * relative to this address.
 */
export const DEFAULT_PLAYBOOK_STORE = 'https://llooma.eu/playbooks/';

export type CatalogOrigin = 'official' | 'community';

/**
 * One row of the listing: enough to draw a card and to filter on, and no more.
 *
 * The procedure itself is deliberately absent. It is the bulk of a playbook and
 * is wanted only by whoever installs it, which is one at a time rather than all
 * at once. What stands in for it is `steps`, so a card can say how big a thing
 * is about to be switched on without downloading it.
 */
export interface PlaybookCatalogEntry {
	id: string;
	name: string;
	summary: string;
	color?: string;
	glyph?: string;
	tags: string[];
	author?: string;
	revision: number;
	origin: CatalogOrigin;
	/** Relative to the store's address. */
	path: string;
	/** How many sections the procedure has. */
	steps?: number;
	/** `sha256-<base64>` over the bundle's bytes, as npm records a package's. */
	integrity?: string;
	/** The fingerprint of what it says, so "you edited this" can be read from the listing. */
	contentDigest?: string;
}

export interface PlaybookCatalog {
	entries: PlaybookCatalogEntry[];
	fetchedAt: string;
}

function parseEntry(value: unknown): PlaybookCatalogEntry | undefined {
	if (!value || typeof value !== 'object') return undefined;
	const o = value as Record<string, unknown>;
	const id = typeof o.id === 'string' ? o.id : '';
	const name = typeof o.name === 'string' ? o.name : '';
	const path = typeof o.path === 'string' ? o.path : '';
	if (!id || !name || !path || path.includes('..') || path.includes('://')) return undefined;

	return {
		id,
		name,
		summary: typeof o.summary === 'string' ? o.summary : '',
		color: typeof o.color === 'string' ? o.color : undefined,
		glyph: typeof o.glyph === 'string' ? o.glyph : undefined,
		tags: Array.isArray(o.tags) ? o.tags.filter((t): t is string => typeof t === 'string') : [],
		author: typeof o.author === 'string' ? o.author : undefined,
		revision: typeof o.revision === 'number' ? o.revision : 1,
		origin: o.origin === 'community' ? 'community' : 'official',
		path,
		steps: typeof o.steps === 'number' ? o.steps : undefined,
		integrity: typeof o.integrity === 'string' ? o.integrity : undefined,
		contentDigest: typeof o.contentDigest === 'string' ? o.contentDigest : undefined
	};
}

/** Read a listing out of parsed JSON, dropping any row that does not describe a playbook. */
export function parsePlaybookIndex(json: unknown): PlaybookCatalogEntry[] | undefined {
	if (!json || typeof json !== 'object') return undefined;
	const o = json as Record<string, unknown>;
	if (o.format !== 'llooma.playbooks' || !Array.isArray(o.entries)) return undefined;
	return o.entries.map(parseEntry).filter((e): e is PlaybookCatalogEntry => !!e);
}

/** What a bundle file contains. The listing's row is a summary of this. */
export interface PlaybookBundle {
	format: 'llooma.playbook';
	version: number;
	id: string;
	revision?: number;
	author?: string;
	license?: string;
	playbook: {
		name: string;
		summary?: string;
		instructions: string;
		color?: string;
		glyph?: string;
		tags?: string[];
	};
}

export function parsePlaybookBundle(json: unknown): PlaybookBundle | undefined {
	if (!json || typeof json !== 'object') return undefined;
	const o = json as Record<string, unknown>;
	if (o.format !== 'llooma.playbook') return undefined;
	const playbook = o.playbook as PlaybookBundle['playbook'] | undefined;
	if (!playbook?.name || typeof playbook.instructions !== 'string') return undefined;
	return o as unknown as PlaybookBundle;
}
