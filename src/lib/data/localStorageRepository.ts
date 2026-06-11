import { toast } from 'svelte-sonner';

import { browser } from '$app/environment';
import type { Server } from '$lib/connections';
import type { Knowledge } from '$lib/knowledge';
import type { Session } from '$lib/sessions';
import { DEFAULT_SETTINGS, type Settings } from '$lib/settings';

import { StorageKey } from './keys';
import type { AppData, Backup, DataRepository } from './repository';

/**
 * Mode `local`: every piece of data lives in the browser's `localStorage`.
 * The reads are synchronous under the hood; the async signatures exist only to
 * satisfy the shared `DataRepository` contract (the server repo needs them).
 */
export class LocalStorageRepository implements DataRepository {
	hydrate(): AppData {
		return {
			settings: this.#read(StorageKey.HollamaNextPreferences, DEFAULT_SETTINGS),
			servers: this.#read<Server[]>(StorageKey.HollamaNextServers, []),
			sessions: this.#read<Session[]>(StorageKey.HollamaNextSessions, []),
			knowledge: this.#read<Knowledge[]>(StorageKey.HollamaNextKnowledge, [])
		};
	}

	async loadSettings(): Promise<Settings | null> {
		return this.#read<Settings | null>(StorageKey.HollamaNextPreferences, null);
	}
	async loadServers(): Promise<Server[]> {
		return this.#read<Server[]>(StorageKey.HollamaNextServers, []);
	}
	async loadSessions(): Promise<Session[]> {
		return this.#read<Session[]>(StorageKey.HollamaNextSessions, []);
	}
	async loadKnowledge(): Promise<Knowledge[]> {
		return this.#read<Knowledge[]>(StorageKey.HollamaNextKnowledge, []);
	}

	async saveSettings(value: Settings): Promise<void> {
		this.#write(StorageKey.HollamaNextPreferences, value);
	}
	async saveServers(value: Server[]): Promise<void> {
		this.#write(StorageKey.HollamaNextServers, value);
	}
	async saveSessions(value: Session[]): Promise<void> {
		this.#write(StorageKey.HollamaNextSessions, value);
	}
	async saveKnowledge(value: Knowledge[]): Promise<void> {
		this.#write(StorageKey.HollamaNextKnowledge, value);
	}

	async exportBackup(): Promise<Backup> {
		const backup: Backup = {};
		if (!browser) return backup;
		for (const key of Object.values(StorageKey)) {
			const raw = localStorage.getItem(key);
			if (raw !== null) backup[key] = JSON.parse(raw);
		}
		return backup;
	}

	async importBackup(backup: Backup): Promise<void> {
		for (const key of Object.values(StorageKey)) {
			if (backup[key] === undefined) continue;
			this.#write(key, backup[key]);
		}
	}

	async resetAll(): Promise<void> {
		if (!browser) return;
		for (const key of Object.values(StorageKey)) localStorage.removeItem(key);
	}

	#read<T>(key: StorageKey, fallback: T): T {
		if (!browser) return fallback;
		const raw = localStorage.getItem(key);
		if (raw === null) return fallback;
		return (JSON.parse(raw) as T) ?? fallback;
	}

	#write(key: StorageKey, value: unknown): void {
		if (!browser) return;
		try {
			localStorage.setItem(key, JSON.stringify(value));
		} catch (error) {
			if (error instanceof DOMException && error.name === 'QuotaExceededError') {
				toast.warning('Local storage is full', {
					id: 'localstorage-full-toast',
					description:
						'You have reached the storage limit for your browser. Please delete some sessions, knowledge, or preferences to free up space.'
				});
			} else {
				toast.warning('Failed to save to localStorage', {
					id: 'localstorage-error-toast',
					description: (error as Error).message
				});
			}
		}
	}
}
