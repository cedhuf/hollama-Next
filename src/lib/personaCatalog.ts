import { get, writable } from 'svelte/store';

import { browser } from '$app/environment';
import { LOCAL_STORAGE_PREFIX } from '$lib/data/keys';
import { personasStore, settingsStore } from '$lib/localStorage';
import { applyBundleToPersona, parsePersonaBundle, type PersonaBundle } from '$lib/personaBundle';
import { personaOrigin } from '$lib/personas';
import { personasConfig } from '$lib/personasConfig';
import { personaState } from '$lib/personaState';
import { parseCatalogIndex, type Catalog, type CatalogEntry } from '$lib/personaStore';
import { catalogBase } from '$lib/store';

/**
 * The store of personas you can install, which is not part of the application.
 *
 * Nothing ships inside the image: the app knows one address, fetches a listing,
 * and fetches a persona whole only on install. That is what lets a persona be
 * added by a pull request instead of a release.
 *
 * The cost is an empty library on a first launch with no network. The listing is
 * cached once it arrives, in server mode the fetch is the instance's rather than
 * each browser's, and the address is a setting, so a closed network can mirror it.
 */

/** Where the last listing is kept, so a second launch does not depend on the network. */
const CACHE_KEY = `${LOCAL_STORAGE_PREFIX}-persona-catalog`;

export type CatalogState =
	| { status: 'idle' }
	| { status: 'loading' }
	| { status: 'ready'; catalog: Catalog; stale: boolean }
	| { status: 'error'; message: string };

const state = writable<CatalogState>({ status: 'idle' });

/** The persona store, as far as this session knows it. */
export const catalogState = { subscribe: state.subscribe };

/** The instance reads on the app's behalf: one machine holds the listing for all its users, and the address is set once by an administrator. */
function base(): string {
	return catalogBase('personas');
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

/** The cached listing shows immediately and is marked stale, so the page never waits on a request. A failed fetch leaves it standing: a slightly old listing beats none. */
export async function loadCatalog(force = false): Promise<void> {
	const current = get(state);
	if (!force && current.status === 'ready' && !current.stale) return;
	if (!force && current.status === 'loading') return;

	const cached = readCache();
	if (cached) state.set({ status: 'ready', catalog: cached, stale: true });
	else state.set({ status: 'loading' });

	try {
		// A forced reload says so to the server too: the instance holds its own copy,
		// and refreshing past one cache into another is not refreshing.
		const response = await fetch(`${base()}index.json${force ? '?fresh=1' : ''}`, {
			headers: { accept: 'application/json' },
			cache: force ? 'no-store' : 'default'
		});
		if (!response.ok) throw new Error(`HTTP ${response.status}`);
		const entries = parseCatalogIndex(await response.json());
		if (!entries) throw new Error('not a persona listing');

		const catalog: Catalog = { entries, fetchedAt: new Date().toISOString() };
		writeCache(catalog);
		state.set({ status: 'ready', catalog, stale: false });

		// Here rather than at the call sites, so it happens wherever the listing is read.
		await autoUpdate(entries);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		if (cached) state.set({ status: 'ready', catalog: cached, stale: true });
		else state.set({ status: 'error', message });
	}
}

/** `crypto.subtle` is only available over HTTPS and on localhost, which is a reason to skip the check rather than refuse the install: it is about a mirror having drifted, not about trusting the connection. */
async function sha256(bytes: ArrayBuffer): Promise<string | undefined> {
	if (!globalThis.crypto?.subtle) return undefined;
	const digest = await crypto.subtle.digest('SHA-256', bytes);
	return `sha256-${btoa(String.fromCharCode(...new Uint8Array(digest)))}`;
}

/** The listing's `integrity` is checked against the bytes as they arrived. A mismatch is refused: the two came from the same place, so disagreeing means one is stale. */
export async function fetchBundle(entry: CatalogEntry): Promise<PersonaBundle> {
	const response = await fetch(`${base()}${entry.path}`, {
		headers: { accept: 'application/json' }
	});
	if (!response.ok) throw new Error(`HTTP ${response.status}`);

	const bytes = await response.arrayBuffer();
	if (entry.integrity) {
		const actual = await sha256(bytes);
		if (actual && actual !== entry.integrity) throw new Error('integrity check failed');
	}

	const bundle = parsePersonaBundle(JSON.parse(new TextDecoder().decode(bytes)));
	if (!bundle) throw new Error('not a persona bundle');
	return bundle;
}

/**
 * Take the new revisions, for the personas nobody has touched. A persona you
 * have edited is yours, and those keep being offered on their card instead.
 *
 * Off by default, and an instance can force it on.
 */
async function autoUpdate(entries: CatalogEntry[]): Promise<void> {
	if (!browser) return;
	const config = get(personasConfig);
	if (!config.autoUpdateForced && !get(settingsStore).personaAutoUpdate) return;

	const byId = new Map(entries.map((entry) => [entry.id, entry]));

	for (const persona of get(personasStore) ?? []) {
		const from = personaOrigin(persona);
		const entry = from ? byId.get(from) : undefined;
		if (!entry) continue;
		if (personaState(persona, entry.contentDigest) !== 'outdated') continue;

		try {
			const bundle = await fetchBundle(entry);
			applyBundleToPersona(persona, bundle, {
				origin: entry.origin,
				id: entry.id,
				revision: entry.revision
			});
		} catch {
			// One that cannot be fetched is not a reason to abandon the others: it will be
			// offered on its card.
		}
	}
}
