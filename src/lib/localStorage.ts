import { writable } from 'svelte/store';

import { browser } from '$app/environment';
import type { Server } from '$lib/connections';
import type { Knowledge } from '$lib/knowledge';
import type { Persona } from '$lib/personas';
import type { Session } from '$lib/sessions';
import { DEFAULT_SETTINGS, type Settings } from '$lib/settings';

import { repository } from './data';

// Re-exported so existing call sites keep importing these from `$lib/localStorage`.
export { LOCAL_STORAGE_PREFIX, StorageKey } from './data/keys';

/**
 * Persistence is suspended until the first hydration completes. In server mode
 * the stores load asynchronously, and any write before that finishes (a page
 * creating a session, the model-list cache, a default theme…) would PUT
 * empty/default values and clobber the server data — the cause of data vanishing
 * on refresh. Local mode hydrates synchronously, so it's ready immediately.
 */
let persistenceReady = !!repository.hydrate;

/**
 * A writable store that persists every change through the active repository.
 *
 * The very first (synchronous) emission — the seed echo — is skipped: there's
 * nothing new to persist, and in server mode persisting the empty seed before
 * async hydration would clobber the user's server-side data. `setQuiet()` sets
 * the value without persisting, used to hydrate from the repository at boot.
 * `reset()` returns the store to `defaultValue`.
 */
function persistedStore<T>(seed: T, defaultValue: T, save: (value: T) => Promise<void>) {
	const store = writable<T>(seed);
	let initialized = false;
	let suppress = false;

	if (browser) {
		store.subscribe((value) => {
			if (!initialized) {
				initialized = true;
				return;
			}
			if (!persistenceReady || suppress) return;
			void save(value);
		});
	}

	return {
		subscribe: store.subscribe,
		set: store.set,
		update: store.update,
		reset: () => store.set(defaultValue),
		setQuiet: (value: T) => {
			suppress = true;
			store.set(value);
			suppress = false;
		}
	};
}

export function sortStore<T extends { updatedAt?: string }>(store: T[]) {
	return store.sort((a, b) => {
		if (!a.updatedAt && !b.updatedAt) return 0;
		if (!a.updatedAt) return 1;
		if (!b.updatedAt) return -1;
		return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
	});
}

export function deleteStoreItem<T extends { id: string }>(store: T[], id: string) {
	return store.filter((s) => s.id !== id);
}

const seed = repository.hydrate?.() ?? {
	settings: DEFAULT_SETTINGS,
	servers: [] as Server[],
	sessions: [] as Session[],
	knowledge: [] as Knowledge[],
	personas: [] as Persona[]
};

export const settingsStore = persistedStore<Settings>(seed.settings, DEFAULT_SETTINGS, (v) =>
	repository.saveSettings(v)
);
export const serversStore = persistedStore<Server[]>(seed.servers, [], (v) =>
	repository.saveServers(v)
);
export const sessionsStore = persistedStore<Session[]>(seed.sessions, [], (v) =>
	repository.saveSessions(v)
);
export const knowledgeStore = persistedStore<Knowledge[]>(seed.knowledge, [], (v) =>
	repository.saveKnowledge(v)
);
export const personasStore = persistedStore<Persona[]>(seed.personas, [], (v) =>
	repository.savePersonas(v)
);

/**
 * Fill the stores from the repository at boot. A no-op in local mode (the seed
 * is already synchronous via `hydrate()`); in server mode it loads each
 * collection over the network and sets the stores quietly (no write-back).
 */
export async function hydrateStores(): Promise<void> {
	if (repository.hydrate) return; // local mode: already seeded synchronously, ready

	try {
		await loadIntoStores();
	} finally {
		// Only now may writes reach the server — the stores hold real data.
		persistenceReady = true;
	}
}

/**
 * Re-read everything, for an app that has been running while the data moved.
 *
 * The stores are filled once at boot and never again, which is right for a page
 * that lives as long as its data. A PWA doesn't: it is suspended and resumed for
 * days, so conversations written from the browser — or from another device
 * against the same server — never appeared until it was force-quit. Called when
 * the app comes back to the foreground.
 *
 * Unlike `hydrateStores` this also refreshes local mode, where a second window
 * writing to the same localStorage leaves the first one just as stale.
 *
 * Settings and servers are deliberately left alone: they are edited in place in
 * the Settings modal, and replacing them under an open field would throw away
 * what is being typed. Only the collections the user browses are re-read.
 */
export async function refreshStores(): Promise<void> {
	if (!browser) return;

	const local = repository.hydrate?.();
	if (local) {
		sessionsStore.setQuiet(local.sessions);
		knowledgeStore.setQuiet(local.knowledge);
		personasStore.setQuiet(local.personas);
		return;
	}

	// Never before the boot hydration has completed: the stores would be filled
	// with data the app isn't yet allowed to write back.
	if (!persistenceReady) return;

	const [sessions, knowledge, personas] = await Promise.all([
		repository.loadSessions(),
		repository.loadKnowledge(),
		repository.loadPersonas()
	]);
	sessionsStore.setQuiet(sessions);
	knowledgeStore.setQuiet(knowledge);
	personasStore.setQuiet(personas);
}

/** The network load shared by the boot and the refresh. */
async function loadIntoStores(): Promise<void> {
	const [settings, servers, sessions, knowledge, personas] = await Promise.all([
		repository.loadSettings(),
		repository.loadServers(),
		repository.loadSessions(),
		repository.loadKnowledge(),
		repository.loadPersonas()
	]);

	if (settings) settingsStore.setQuiet(settings);
	serversStore.setQuiet(servers);
	sessionsStore.setQuiet(sessions);
	knowledgeStore.setQuiet(knowledge);
	personasStore.setQuiet(personas);
}
