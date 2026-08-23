import { toast } from 'svelte-sonner';

import { browser } from '$app/environment';
import { adoptLegacyNotes } from '$lib/chat/legacyNotes';
import type { Server } from '$lib/connections';
import { searchSessionsLocally, type ConversationResult } from '$lib/conversationSearch';
import type { Knowledge } from '$lib/knowledge';
import type { PersonaMemory } from '$lib/personaMemory';
import type { Persona } from '$lib/personas';
import type { Playbook } from '$lib/playbooks';
import type { Session } from '$lib/sessions';
import { normalizeSession, summarizeSession, type SessionSummary } from '$lib/sessionShape';
import { DEFAULT_SETTINGS, type Settings } from '$lib/settings';

import { StorageKey } from './keys';
import type { AppData, Backup, DataRepository } from './repository';

/**
 * Mode `local`: every piece of data lives in the browser's `localStorage`.
 * The reads are synchronous under the hood; the async signatures exist only to
 * satisfy the shared `DataRepository` contract (the server repo needs them).
 */
export class LocalStorageRepository implements DataRepository {
	constructor() {
		this.#adoptLegacyNotes();
	}

	/**
	 * Bring stored conversations onto the single `note` field, once.
	 *
	 * The browser's half of the server's migration 9, running the same conversion
	 * so the two cannot disagree. In the constructor, so it is done before
	 * `hydrate()` reads anything, and it writes only when something actually
	 * changed: on the overwhelmingly common load where there is nothing to do it
	 * costs one parse and no write.
	 *
	 * TODO (note migration): removable a few versions after this shipped, along
	 * with `chat/legacyNotes`.
	 */
	#adoptLegacyNotes(): void {
		if (!browser) return;

		const stored = localStorage.getItem(StorageKey.Sessions);
		if (!stored) return;

		try {
			const sessions = JSON.parse(stored);
			if (!Array.isArray(sessions)) return;
			if (adoptLegacyNotes(sessions) === 0) return;
			localStorage.setItem(StorageKey.Sessions, JSON.stringify(sessions));
		} catch {
			// Unreadable storage is not this method's problem to solve: `hydrate`
			// falls back to an empty collection, and failing here would take the app
			// down on a load that would otherwise merely start empty.
		}
	}

	hydrate(): AppData {
		return {
			settings: { ...DEFAULT_SETTINGS, ...this.#read(StorageKey.Preferences, {}) },
			servers: this.#read<Server[]>(StorageKey.Servers, []),
			sessions: this.#readSummaries(),
			knowledge: this.#read<Knowledge[]>(StorageKey.Knowledge, []),
			personas: this.#read<Persona[]>(StorageKey.Personas, []),
			personaMemory: this.#read<PersonaMemory[]>(StorageKey.PersonaMemory, []),
			playbooks: this.#read<Playbook[]>(StorageKey.Playbooks, [])
		};
	}

	async loadSettings(): Promise<Settings | null> {
		const stored = this.#read<Partial<Settings> | null>(StorageKey.Preferences, null);
		// Backfill any keys added since these settings were last saved (e.g. systemPrompts).
		return stored ? { ...DEFAULT_SETTINGS, ...stored } : null;
	}
	async loadServers(): Promise<Server[]> {
		return this.#read<Server[]>(StorageKey.Servers, []);
	}
	async loadSessions(): Promise<SessionSummary[]> {
		return this.#readSummaries();
	}
	// `fetchFn` is part of the shared contract; localStorage has nothing to fetch.
	async loadSession(id: string): Promise<Session | null> {
		const session = this.#read<Session[]>(StorageKey.Sessions, []).find(
			(candidate) => candidate.id === id
		);
		return session ? normalizeSession(session) : null;
	}

	/**
	 * localStorage holds one blob, so the messages are read either way, but they
	 * are dropped here rather than kept in the store, so both modes present the
	 * lists with the same shape and nothing can save a summary as a conversation.
	 */
	#readSummaries(): SessionSummary[] {
		return this.#read<Session[]>(StorageKey.Sessions, []).map(summarizeSession);
	}
	async loadKnowledge(): Promise<Knowledge[]> {
		return this.#read<Knowledge[]>(StorageKey.Knowledge, []);
	}
	async loadPersonaMemory(): Promise<PersonaMemory[]> {
		return this.#read<PersonaMemory[]>(StorageKey.PersonaMemory, []);
	}

	async loadPersonas(): Promise<Persona[]> {
		return this.#read<Persona[]>(StorageKey.Personas, []);
	}
	async loadPlaybooks(): Promise<Playbook[]> {
		return this.#read<Playbook[]>(StorageKey.Playbooks, []);
	}

	async saveSettings(value: Settings): Promise<void> {
		this.#write(StorageKey.Preferences, value);
	}
	async saveServers(value: Server[]): Promise<void> {
		this.#write(StorageKey.Servers, value);
	}
	async saveSession(session: Session): Promise<void> {
		this.#upsert(StorageKey.Sessions, session);
	}
	async deleteSession(id: string): Promise<void> {
		this.#remove(StorageKey.Sessions, id);
	}
	async saveKnowledgeItem(knowledge: Knowledge): Promise<void> {
		this.#upsert(StorageKey.Knowledge, knowledge);
	}
	async deleteKnowledgeItem(id: string): Promise<void> {
		this.#remove(StorageKey.Knowledge, id);
	}
	async savePersona(persona: Persona): Promise<void> {
		this.#upsert(StorageKey.Personas, persona);
	}
	async deletePersona(id: string): Promise<void> {
		this.#remove(StorageKey.Personas, id);
		// A persona that is gone can have no memory: nothing could ever read it, and
		// a new persona reusing the id would inherit somebody else's past.
		this.#remove(StorageKey.PersonaMemory, id);
	}
	async savePlaybook(playbook: Playbook): Promise<void> {
		this.#upsert(StorageKey.Playbooks, playbook);
	}
	async deletePlaybook(id: string): Promise<void> {
		this.#remove(StorageKey.Playbooks, id);
	}

	async replaceSessions(value: Session[]): Promise<void> {
		this.#write(StorageKey.Sessions, value);
	}
	async replaceKnowledge(value: Knowledge[]): Promise<void> {
		this.#write(StorageKey.Knowledge, value);
	}
	async savePersonaMemory(memory: PersonaMemory): Promise<void> {
		this.#upsert(StorageKey.PersonaMemory, memory);
	}

	async deletePersonaMemory(personaId: string): Promise<void> {
		this.#remove(StorageKey.PersonaMemory, personaId);
	}

	async replacePersonaMemory(value: PersonaMemory[]): Promise<void> {
		this.#write(StorageKey.PersonaMemory, value);
	}

	async replacePersonas(value: Persona[]): Promise<void> {
		this.#write(StorageKey.Personas, value);
	}
	async replacePlaybooks(value: Playbook[]): Promise<void> {
		this.#write(StorageKey.Playbooks, value);
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

	async searchSessions(query: string, everything = false): Promise<ConversationResult[]> {
		return searchSessionsLocally(this.#read<Session[]>(StorageKey.Sessions, []), query, everything);
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
