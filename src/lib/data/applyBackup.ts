import {
	knowledgeStore,
	personasStore,
	serversStore,
	sessionsStore,
	settingsStore
} from '$lib/localStorage';

import { readBackupEntry, StorageKey } from './keys';
import type { Backup } from './repository';

/**
 * Apply one category of imported/restored data to its store. Assigning the
 * store persists it automatically through the active repository — no direct
 * storage access needed in components.
 */
export function applyToStore(storageKey: StorageKey, data: unknown) {
	switch (storageKey) {
		case StorageKey.Preferences:
			settingsStore.set(data as Parameters<typeof settingsStore.set>[0]);
			break;
		case StorageKey.Servers:
			serversStore.set(data as Parameters<typeof serversStore.set>[0]);
			break;
		// Restoring really does mean "this is now the whole collection" — the one
		// place the wholesale write is the correct operation.
		case StorageKey.Sessions:
			sessionsStore.replaceAll(data as Parameters<typeof sessionsStore.replaceAll>[0]);
			break;
		case StorageKey.Knowledge:
			knowledgeStore.replaceAll(data as Parameters<typeof knowledgeStore.replaceAll>[0]);
			break;
		case StorageKey.Personas:
			personasStore.replaceAll(data as Parameters<typeof personasStore.replaceAll>[0]);
			break;
	}
}

/**
 * Apply a full backup, skipping categories the file doesn't contain.
 *
 * Entries are looked up under both the current and the pre-rename keys, so a
 * file exported when the app was still called Hollama Next restores exactly the
 * same way as one written today.
 */
export function applyBackupToStores(backup: Backup) {
	for (const storageKey of Object.values(StorageKey)) {
		const data = readBackupEntry(backup, storageKey);
		if (data === undefined) continue;
		applyToStore(storageKey, data);
	}
}
