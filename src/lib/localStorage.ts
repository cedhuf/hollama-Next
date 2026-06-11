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
 * `seed` is the synchronous initial value (no-flash in local mode); `reset()`
 * returns the store to `defaultValue`.
 */
function persistedStore<T>(seed: T, defaultValue: T, save: (value: T) => Promise<void>) {
	const store = writable<T>(seed);

	if (browser) {
		// Fires synchronously with `seed`, then on every subsequent change —
		// matching the previous inline-localStorage behaviour.
		store.subscribe((value) => void save(value));
	}

	return {
		...store,
		reset: () => store.set(defaultValue)
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
