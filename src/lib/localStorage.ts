import { writable } from 'svelte/store';

import { browser } from '$app/environment';
import type { Server } from '$lib/connections';
import type { Knowledge } from '$lib/knowledge';
import type { Session } from '$lib/sessions';
import { DEFAULT_SETTINGS, type Settings } from '$lib/settings';

import { repository } from './data';

// Re-exported so existing call sites keep importing these from `$lib/localStorage`.
export { LOCAL_STORAGE_PREFIX, StorageKey } from './data/keys';

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
			if (!suppress) void save(value);
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
	knowledge: [] as Knowledge[]
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

/**
 * Fill the stores from the repository at boot. A no-op in local mode (the seed
 * is already synchronous via `hydrate()`); in server mode it loads each
 * collection over the network and sets the stores quietly (no write-back).
 */
export async function hydrateStores(): Promise<void> {
	if (repository.hydrate) return;

	const [settings, servers, sessions, knowledge] = await Promise.all([
		repository.loadSettings(),
		repository.loadServers(),
		repository.loadSessions(),
		repository.loadKnowledge()
	]);

	if (settings) settingsStore.setQuiet(settings);
	serversStore.setQuiet(servers);
	sessionsStore.setQuiet(sessions);
	knowledgeStore.setQuiet(knowledge);
}
