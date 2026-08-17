import { adoptLegacyNotes } from '$lib/chat/legacyNotes';
import {
	knowledgeStore,
	personasStore,
	playbooksStore,
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
		case StorageKey.Preferences:
			settingsStore.set(data as Parameters<typeof settingsStore.set>[0]);
			break;
		case StorageKey.Servers:
			serversStore.set(data as Parameters<typeof serversStore.set>[0]);
			break;
		// Restoring really does mean "this is now the whole collection" — the one
		// place the wholesale write is the correct operation.
		//
		// An exported file never ages out, so a backup written before notes became
		// one field is converted here rather than assumed away.
		case StorageKey.Sessions:
			if (Array.isArray(data)) adoptLegacyNotes(data);
			sessionsStore.replaceAll(data as Parameters<typeof sessionsStore.replaceAll>[0]);
			break;
		case StorageKey.Knowledge:
			knowledgeStore.replaceAll(data as Parameters<typeof knowledgeStore.replaceAll>[0]);
			break;
		case StorageKey.Personas:
			personasStore.replaceAll(data as Parameters<typeof personasStore.replaceAll>[0]);
			break;
		case StorageKey.Playbooks:
			playbooksStore.replaceAll(data as Parameters<typeof playbooksStore.replaceAll>[0]);
			break;
	}
}

/**
 * Apply a full backup, skipping categories the file doesn't contain.
 */
export function applyBackupToStores(backup: Backup) {
	for (const storageKey of Object.values(StorageKey)) {
		const data = backup[storageKey];
		if (data === undefined) continue;
		applyToStore(storageKey, data);
	}
}
