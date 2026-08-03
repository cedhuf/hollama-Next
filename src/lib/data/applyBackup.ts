import {
	knowledgeStore,
	personasStore,
	serversStore,
	sessionsStore,
	settingsStore
} from '$lib/localStorage';

import { StorageKey } from './keys';
import type { Backup } from './repository';

/**
 * Apply one category of imported/restored data to its store. Assigning the
 * store persists it automatically through the active repository — no direct
 * storage access needed in components.
 */
export function applyToStore(storageKey: StorageKey, data: unknown) {
	switch (storageKey) {
		case StorageKey.HollamaNextPreferences:
			settingsStore.set(data as Parameters<typeof settingsStore.set>[0]);
			break;
		case StorageKey.HollamaNextServers:
			serversStore.set(data as Parameters<typeof serversStore.set>[0]);
			break;
		// Restoring really does mean "this is now the whole collection" — the one
		// place the wholesale write is the correct operation.
		case StorageKey.HollamaNextSessions:
			sessionsStore.replaceAll(data as Parameters<typeof sessionsStore.replaceAll>[0]);
			break;
		case StorageKey.HollamaNextKnowledge:
			knowledgeStore.replaceAll(data as Parameters<typeof knowledgeStore.replaceAll>[0]);
			break;
		case StorageKey.HollamaNextPersonas:
			personasStore.replaceAll(data as Parameters<typeof personasStore.replaceAll>[0]);
			break;
	}
}

/** Apply a full backup, skipping categories the file doesn't contain. */
export function applyBackupToStores(backup: Backup) {
	for (const storageKey of Object.values(StorageKey)) {
		if (backup[storageKey] === undefined) continue;
		applyToStore(storageKey, backup[storageKey]);
	}
}
