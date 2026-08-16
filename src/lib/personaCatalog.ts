import { get, writable } from 'svelte/store';

import { env } from '$env/dynamic/public';
import { browser } from '$app/environment';
import { LOCAL_STORAGE_PREFIX } from '$lib/data/keys';
import { settingsStore } from '$lib/localStorage';
import { parsePersonaBundle, type PersonaBundle } from '$lib/personaBundle';
import {
	DEFAULT_PERSONA_STORE,
	parseCatalogIndex,
	type Catalog,
	type CatalogEntry
} from '$lib/personaStore';

/**
 * The store of personas you can install, which is not part of the application.
 *
 * Nothing ships inside the image. The app knows one address, fetches a listing
 * from it, and fetches a persona whole only when someone installs it. That is
 * what lets a persona be added by a pull request instead of a release, and what
 * lets the store move to a repository of its own later.
 *
 * What it costs is worth stating plainly: with nothing bundled, a first launch
 * with no network has an empty library. Three things blunt that. The listing is
 * cached once it arrives, so only the very first launch depends on the network;
 * in server mode the fetch is the instance's rather than each browser's, so one
 * machine can hold it for everyone; and the address is a setting, so a closed
 * network can point at its own mirror.
 */

/** Where the last listing is kept, so a second launch does not depend on the network. */
const CACHE_KEY = `${LOCAL_STORAGE_PREFIX}-persona-catalog`;

const isServer = env.PUBLIC_MODE === 'server';

export type CatalogState =
	| { status: 'idle' }
	| { status: 'loading' }
	| { status: 'ready'; catalog: Catalog; stale: boolean }
	| { status: 'error'; message: string };

const state = writable<CatalogState>({ status: 'idle' });

/** The persona store, as far as this session knows it. */
export const catalogState = { subscribe: state.subscribe };

/**
 * The address to read, which is not always the address of the store.
 *
 * In server mode the instance reads on the app's behalf: one machine holds the
 * listing for all its users, an instance whose browsers have no way out can
 * still be given a store, and the address is set once by an administrator rather
 * than by each person.
 */
function base(): string {
	if (isServer) return '/api/personas/catalog/';
	const configured = get(settingsStore).personaStoreUrl?.trim();
	const url = configured || DEFAULT_PERSONA_STORE;
	return url.endsWith('/') ? url : `${url}/`;
}

function readCache(): Catalog | undefined {
	if (!browser) return undefined;
	try {
		const raw = localStorage.getItem(CACHE_KEY);
		if (!raw) return undefined;
		const cached = JSON.parse(raw) as { entries?: unknown; fetchedAt?: string };
		const entries = parseCatalogIndex({ format: 'llooma.personas', entries: cached.entries });
		if (!entries?.length) return undefined;
		return { entries, fetchedAt: cached.fetchedAt ?? '' };
	} catch {
		return undefined;
	}
}

function writeCache(catalog: Catalog): void {
	if (!browser) return;
	try {
		localStorage.setItem(CACHE_KEY, JSON.stringify(catalog));
	} catch {
		/* a full quota is not worth failing a page for */
	}
}

/**
 * Fill the browser, from the cache first and then from the network.
 *
 * The cached listing shows immediately and is marked stale, so opening the page
 * never waits on a request; the fetched one replaces it when it arrives. A
 * failed fetch leaves the cached listing standing rather than replacing it with
 * an error, because a slightly old listing is far more useful than none.
 */
export async function loadCatalog(force = false): Promise<void> {
	const current = get(state);
	if (!force && current.status === 'ready' && !current.stale) return;
	if (!force && current.status === 'loading') return;

	const cached = readCache();
	if (cached) state.set({ status: 'ready', catalog: cached, stale: true });
	else state.set({ status: 'loading' });

	try {
		const response = await fetch(`${base()}index.json`, {
			headers: { accept: 'application/json' }
		});
		if (!response.ok) throw new Error(`HTTP ${response.status}`);
		const entries = parseCatalogIndex(await response.json());
		if (!entries) throw new Error('not a persona listing');

		const catalog: Catalog = { entries, fetchedAt: new Date().toISOString() };
		writeCache(catalog);
		state.set({ status: 'ready', catalog, stale: false });
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		if (cached) state.set({ status: 'ready', catalog: cached, stale: true });
		else state.set({ status: 'error', message });
	}
}

/** Fetch one persona whole, at the moment it is being installed. */
export async function fetchBundle(entry: CatalogEntry): Promise<PersonaBundle> {
	const response = await fetch(`${base()}${entry.path}`, {
		headers: { accept: 'application/json' }
	});
	if (!response.ok) throw new Error(`HTTP ${response.status}`);
	const bundle = parsePersonaBundle(await response.json());
	if (!bundle) throw new Error('not a persona bundle');
	return bundle;
}
