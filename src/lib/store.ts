/**
 * The store: one address, several catalogues.
 *
 * Playbooks would otherwise have added a second address, setting, proxy route
 * and admin field, and whatever comes next a third of each. So there is one
 * address and a folder per kind under it:
 *
 *   <store>/personas/index.json      the listing
 *   <store>/personas/bundles/<id>.json
 *   <store>/playbooks/index.json
 *   <store>/playbooks/bundles/<id>.json
 *
 * Adding a kind is a folder in the store and a value in `StoreKind`. Nothing
 * here touches a store or the browser, so it is safe to import anywhere.
 */

/** Served from the documentation site, which is published from this repository. Moving it elsewhere changes this line and nothing else: every path in a listing is relative to its own catalogue. */
export const DEFAULT_STORE = 'https://llooma.eu/store/';

/** What the store carries. A directory name, and the app's word for the kind. */
export type StoreKind = 'personas' | 'playbooks';

/** A path is joined onto the store's address, so one that escaped it would let a listing point the app anywhere. */
export function isSafeCatalogPath(path: string): boolean {
	return !!path && !path.includes('..') && !path.includes('://') && !path.startsWith('/');
}

/** The address, with the single trailing slash everything below assumes. */
export function normalizeStoreUrl(url: string): string {
	return url.replace(/\/*$/, '/');
}

/** The instance reads on the app's behalf: one machine holds the listing for all its users, and the address is set once by an administrator. */
export function catalogBase(kind: StoreKind): string {
	return `/api/store/${kind}/`;
}
