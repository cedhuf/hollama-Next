/**
 * The store: one address, several catalogues.
 *
 * It began as one folder of personas and a setting pointing at it. Adding
 * playbooks made the shape of that mistake obvious: a second address, a second
 * setting, a second proxy route, a second admin field, and a person running a
 * mirror having to move both and remember which is which. Whatever comes next:
 * plugins, prompts, whole instance presets: would have added a third of each.
 *
 * So there is one address, and what lives under it is a folder per kind:
 *
 *   <store>/personas/index.json      the listing
 *   <store>/personas/bundles/<id>.json
 *   <store>/playbooks/index.json
 *   <store>/playbooks/bundles/<id>.json
 *
 * A kind is a directory name and nothing more. Adding one is a folder in the
 * store and a value in `StoreKind`; no new setting, no new route, no new field
 * for an administrator to discover.
 *
 * Nothing here touches a store or the browser, so it is safe to import anywhere.
 */

/**
 * Where the store lives.
 *
 * Served from the documentation site, which is published from this repository
 * and already sits behind a domain of ours. Moving it to a repository of its own
 * later changes this line and nothing else: every path in every listing is
 * relative to its own catalogue.
 */
export const DEFAULT_STORE = 'https://llooma.eu/store/';

/** What the store carries. A directory name, and the app's word for the kind. */
export type StoreKind = 'personas' | 'playbooks';

/**
 * A path is joined onto the store's address, so one that escaped it would let a
 * listing point the app anywhere. It cannot be absolute and it cannot climb.
 */
export function isSafeCatalogPath(path: string): boolean {
	return !!path && !path.includes('..') && !path.includes('://') && !path.startsWith('/');
}

/** The address, with the single trailing slash everything below assumes. */
export function normalizeStoreUrl(url: string): string {
	return url.replace(/\/*$/, '/');
}

/**
 * The address a catalogue is read from, which is not always the store's.
 *
 * In server mode the instance reads on the app's behalf: one machine holds the
 * listing for all its users, an instance whose browsers have no way out can
 * still be given a store, and the address is set once by an administrator rather
 * than by each person. In local mode the browser reads it directly, from the
 * setting or from ours.
 */
export function catalogBase(kind: StoreKind, isServerMode: boolean, configured?: string): string {
	if (isServerMode) return `/api/store/${kind}/`;
	return `${normalizeStoreUrl(configured?.trim() || DEFAULT_STORE)}${kind}/`;
}
