import { get, writable } from 'svelte/store';

import { env } from '$env/dynamic/public';
import { browser } from '$app/environment';
import { LOCAL_STORAGE_PREFIX } from '$lib/data/keys';
import { personasStore, settingsStore } from '$lib/localStorage';
import { applyBundleToPersona, parsePersonaBundle, type PersonaBundle } from '$lib/personaBundle';
import { personaOrigin } from '$lib/personas';
import { personasConfig } from '$lib/personasConfig';
import { personaState } from '$lib/personaState';
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
		// A forced reload says so to the server as well as to the browser: the
		// instance holds its own copy, and refreshing past one cache into another is
		// not refreshing.
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

		// Here rather than at the call sites, so it happens wherever the listing is
		// read and nobody has to remember to ask for it.
		await autoUpdate(entries);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		if (cached) state.set({ status: 'ready', catalog: cached, stale: true });
		else state.set({ status: 'error', message });
	}
}

/**
 * `sha256-<base64>` over some bytes, the way the listing writes it.
 *
 * `crypto.subtle` is only available over HTTPS and on localhost. Anywhere else
 * it is missing entirely, which is a reason to skip the check rather than to
 * refuse the install: the check is about a mirror having drifted, not about
 * trusting the connection, and an insecure origin has larger problems.
 */
async function sha256(bytes: ArrayBuffer): Promise<string | undefined> {
	if (!globalThis.crypto?.subtle) return undefined;
	const digest = await crypto.subtle.digest('SHA-256', bytes);
	return `sha256-${btoa(String.fromCharCode(...new Uint8Array(digest)))}`;
}

/**
 * Fetch one persona whole, at the moment it is being installed.
 *
 * The listing's `integrity` is checked here when there is one, against the bytes
 * as they arrived. A mismatch is refused: the two came from the same place and
 * disagreeing means one of them is stale, which is exactly the case where
 * carrying on installs something nobody published.
 */
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
 * Take the new revisions, for the personas nobody has touched.
 *
 * Only those. A persona you have edited is yours, and replacing your text
 * because someone upstream changed theirs is not an update, it is a loss. Those
 * keep being offered on their card instead, which is where the choice belongs.
 *
 * Off by default, and an instance can force it on: an administrator who wants
 * their people on the current version of what they hand out should not have to
 * hope each of them ticked a box.
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
			// One that cannot be fetched is not a reason to abandon the others, and
			// not a reason to interrupt anyone: it will be offered on its card.
		}
	}
}
