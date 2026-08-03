import { toast } from 'svelte-sonner';

import { browser } from '$app/environment';
import type { Server } from '$lib/connections';
import type { Knowledge } from '$lib/knowledge';
import type { Persona } from '$lib/personas';
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
			settings: { ...DEFAULT_SETTINGS, ...this.#read(StorageKey.HollamaNextPreferences, {}) },
			servers: this.#read<Server[]>(StorageKey.HollamaNextServers, []),
			sessions: this.#read<Session[]>(StorageKey.HollamaNextSessions, []),
			knowledge: this.#read<Knowledge[]>(StorageKey.HollamaNextKnowledge, []),
			personas: this.#read<Persona[]>(StorageKey.HollamaNextPersonas, [])
		};
	}

	async loadSettings(): Promise<Settings | null> {
		const stored = this.#read<Partial<Settings> | null>(StorageKey.HollamaNextPreferences, null);
		// Backfill any keys added since these settings were last saved (e.g. systemPrompts).
		return stored ? { ...DEFAULT_SETTINGS, ...stored } : null;
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
	async loadPersonas(): Promise<Persona[]> {
		return this.#read<Persona[]>(StorageKey.HollamaNextPersonas, []);
	}

	async saveSettings(value: Settings): Promise<void> {
		this.#write(StorageKey.HollamaNextPreferences, value);
	}
	async saveServers(value: Server[]): Promise<void> {
		this.#write(StorageKey.HollamaNextServers, value);
	}
	async saveSession(session: Session): Promise<void> {
		this.#upsert(StorageKey.HollamaNextSessions, session);
	}
	async deleteSession(id: string): Promise<void> {
		this.#remove(StorageKey.HollamaNextSessions, id);
	}
	async saveKnowledgeItem(knowledge: Knowledge): Promise<void> {
		this.#upsert(StorageKey.HollamaNextKnowledge, knowledge);
	}
	async deleteKnowledgeItem(id: string): Promise<void> {
		this.#remove(StorageKey.HollamaNextKnowledge, id);
	}
	async savePersona(persona: Persona): Promise<void> {
		this.#upsert(StorageKey.HollamaNextPersonas, persona);
	}
	async deletePersona(id: string): Promise<void> {
		this.#remove(StorageKey.HollamaNextPersonas, id);
	}

	async replaceSessions(value: Session[]): Promise<void> {
		this.#write(StorageKey.HollamaNextSessions, value);
	}
	async replaceKnowledge(value: Knowledge[]): Promise<void> {
		this.#write(StorageKey.HollamaNextKnowledge, value);
	}
	async replacePersonas(value: Persona[]): Promise<void> {
		this.#write(StorageKey.HollamaNextPersonas, value);
	}

	/**
	 * localStorage has no notion of a row, so an item write is read-modify-write of
	 * the blob. Re-reading rather than trusting a caller-held array is the point:
	 * whatever another tab wrote in the meantime survives, which is exactly the
	 * guarantee the whole-collection write did not give.
	 */
	#upsert<T extends { id: string }>(key: StorageKey, item: T): void {
		const items = this.#read<T[]>(key, []);
		const index = items.findIndex((existing) => existing.id === item.id);
		if (index === -1) items.push(item);
		else items[index] = item;
		this.#write(key, items);
	}

	#remove(key: StorageKey, id: string): void {
		this.#write(
			key,
			this.#read<{ id: string }[]>(key, []).filter((item) => item.id !== id)
		);
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
