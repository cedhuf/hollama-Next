import { browser } from '$app/environment';
import type { Server } from '$lib/connections';
import type { ConversationResult } from '$lib/conversationSearch';
import type { Knowledge } from '$lib/knowledge';
import type { PersonaMemory } from '$lib/personaMemory';
import type { Persona } from '$lib/personas';
import type { Playbook } from '$lib/playbooks';
import { fetchProviders, providerToServer } from '$lib/providerCatalogue';
import type { Session } from '$lib/sessions';
import { normalizeSession, type SessionSummary } from '$lib/sessionShape';
import { DEFAULT_SETTINGS, type Settings } from '$lib/settings';
import { toast } from '$lib/toast';

import { NotAuthenticatedError, type Backup, type DataRepository } from './repository';

type Collection =
	'sessions' | 'knowledge' | 'personas' | 'playbooks' | 'persona-memory' | 'settings';

const DEBOUNCE_MS = 800;

/**
 * Mode `server`: data lives in SQLite behind the guarded `/api/data` endpoints.
 *
 * Writes are debounced and coalesced per item, since the stores persist a whole
 * collection on every change, down to each streamed token. Pending writes are
 * flushed on `pagehide` with `keepalive`.
 *
 * No `hydrate()`: the stores seed with defaults and the layout fills them.
 */
export class ApiRepository implements DataRepository {
	/** Keyed by request URL, so each item debounces on its own. */
	#timers = new Map<string, ReturnType<typeof setTimeout>>();
	#pending = new Map<string, unknown>();

	constructor() {
		if (browser) window.addEventListener('pagehide', () => this.#flush());
	}

	async loadSettings(): Promise<Settings | null> {
		const stored = await this.#get<Partial<Settings> | null>('settings', null);
		// Backfill any keys added since these settings were last saved (e.g. systemPrompts).
		return stored ? { ...DEFAULT_SETTINGS, ...stored } : null;
	}
	async loadSessions(): Promise<SessionSummary[]> {
		return this.#get<SessionSummary[]>('sessions', []);
	}

	/** A 404 means "no such conversation yet", which is how a new chat begins. Anything else throws, so an unreachable server is never mistaken for an empty conversation. */
	async loadSession(id: string, fetchFn: typeof fetch = fetch): Promise<Session | null> {
		const response = await fetchFn(`/api/data/sessions/${id}`);
		if (response.status === 404) return null;
		if (!response.ok) throw new Error(`GET /api/data/sessions/${id}: HTTP ${response.status}`);
		return normalizeSession((await response.json()) as Session);
	}
	async loadKnowledge(): Promise<Knowledge[]> {
		return this.#get<Knowledge[]>('knowledge', []);
	}
	async loadPersonas(): Promise<Persona[]> {
		return this.#get<Persona[]>('personas', []);
	}

	async loadPersonaMemory(): Promise<PersonaMemory[]> {
		return this.#get<PersonaMemory[]>('persona-memory', []);
	}
	/**
	 * Playbooks, and nothing if this server has never heard of them.
	 *
	 * A 404 means the server predates the collection, which happens on every rolling
	 * deploy. As an error it took the whole boot down, since the load is one
	 * `Promise.all`.
	 *
	 * Empty rather than absent is safe only because a collection is persisted one
	 * item at a time, so an empty store cannot write an empty collection back.
	 * Anything other than a 404 still throws.
	 */
	async loadPlaybooks(): Promise<Playbook[]> {
		return this.#getOptional<Playbook[]>('playbooks', []);
	}
	async loadServers(): Promise<Server[]> {
		const { servers } = await fetchProviders(true);
		return servers.map(providerToServer);
	}

	async saveSettings(value: Settings): Promise<void> {
		this.#schedule('/api/data/settings', value);
	}
	async saveSession(session: Session): Promise<void> {
		this.#schedule(`/api/data/sessions/${session.id}`, session);
	}
	async saveKnowledgeItem(knowledge: Knowledge): Promise<void> {
		this.#schedule(`/api/data/knowledge/${knowledge.id}`, knowledge);
	}
	async savePersona(persona: Persona): Promise<void> {
		this.#schedule(`/api/data/personas/${persona.id}`, persona);
	}

	/** Sent immediately, cancelling any write still queued for that item: a debounced save landing after its own delete would resurrect it. */
	async deleteSession(id: string): Promise<void> {
		await this.#delete(`/api/data/sessions/${id}`);
	}
	async deleteKnowledgeItem(id: string): Promise<void> {
		await this.#delete(`/api/data/knowledge/${id}`);
	}
	async deletePersona(id: string): Promise<void> {
		await this.#delete(`/api/data/personas/${id}`);
		await this.#delete(`/api/data/persona-memory/${id}`);
	}
	async savePlaybook(playbook: Playbook): Promise<void> {
		this.#schedule(`/api/data/playbooks/${playbook.id}`, playbook);
	}
	async deletePlaybook(id: string): Promise<void> {
		await this.#delete(`/api/data/playbooks/${id}`);
	}

	async replaceSessions(value: Session[]): Promise<void> {
		await this.#put('/api/data/sessions', value);
	}
	async replaceKnowledge(value: Knowledge[]): Promise<void> {
		await this.#put('/api/data/knowledge', value);
	}
	async replacePersonas(value: Persona[]): Promise<void> {
		await this.#put('/api/data/personas', value);
	}

	async savePersonaMemory(memory: PersonaMemory): Promise<void> {
		this.#schedule(`/api/data/persona-memory/${memory.id}`, memory);
	}

	async deletePersonaMemory(personaId: string): Promise<void> {
		await this.#delete(`/api/data/persona-memory/${personaId}`);
	}

	async replacePersonaMemory(value: PersonaMemory[]): Promise<void> {
		await this.#put('/api/data/persona-memory', value);
	}
	async replacePlaybooks(value: Playbook[]): Promise<void> {
		await this.#put('/api/data/playbooks', value);
	}

	async saveServers(): Promise<void> {
		// TODO (step 5): persist a user's personal servers.
	}

	async searchSessions(query: string, everything = false): Promise<ConversationResult[]> {
		const response = await fetch(
			`/api/search/sessions?q=${encodeURIComponent(query)}${everything ? '&all=1' : ''}`
		);
		if (!response.ok) throw new Error(`Search failed: HTTP ${response.status}`);
		return response.json();
	}

	async exportBackup(): Promise<Backup> {
		const response = await fetch('/api/data/backup');
		return response.ok ? response.json() : {};
	}

	async importBackup(backup: Backup): Promise<void> {
		await fetch('/api/data/backup', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(backup)
		});
	}

	async resetAll(): Promise<void> {
		this.#timers.forEach((timer) => clearTimeout(timer));
		this.#timers.clear();
		this.#pending.clear();
		await fetch('/api/data/reset', { method: 'POST' });
	}

	/**
	 * Reads a collection, or throws. It must never answer "empty" for "I could not
	 * tell": a failed read returning `[]` would leave the store empty and the next
	 * save would replace every stored row with nothing. Absent from the server is a
	 * genuine empty and keeps the fallback.
	 */
	/** As `#get`, but a collection this server does not know about is simply empty. */
	async #getOptional<T>(collection: Collection, fallback: T): Promise<T> {
		const response = await fetch(`/api/data/${collection}`);
		if (response.status === 401) throw new NotAuthenticatedError();
		if (response.status === 404) return fallback;
		if (!response.ok) throw new Error(`GET /api/data/${collection}: HTTP ${response.status}`);
		return ((await response.json()) as T) ?? fallback;
	}

	async #get<T>(collection: Collection, fallback: T): Promise<T> {
		const response = await fetch(`/api/data/${collection}`);
		if (response.status === 401) throw new NotAuthenticatedError();
		if (!response.ok) throw new Error(`GET /api/data/${collection}: HTTP ${response.status}`);
		return ((await response.json()) as T) ?? fallback;
	}

	/** Keyed on the item's own URL, so a burst on the open conversation is not merged with an unrelated edit to another one. */
	#schedule(url: string, value: unknown): void {
		this.#pending.set(url, value);
		clearTimeout(this.#timers.get(url));
		this.#timers.set(
			url,
			setTimeout(() => {
				this.#timers.delete(url);
				this.#pending.delete(url);
				void this.#put(url, value);
			}, DEBOUNCE_MS)
		);
	}

	async #put(url: string, value: unknown, keepalive = false): Promise<void> {
		await this.#send(url, 'PUT', JSON.stringify(value), keepalive);
	}

	/** Sent straight away, cancelling any queued write that would resurrect the item. */
	async #delete(url: string): Promise<void> {
		clearTimeout(this.#timers.get(url));
		this.#timers.delete(url);
		this.#pending.delete(url);
		await this.#send(url, 'DELETE');
	}

	async #send(url: string, method: string, body?: string, keepalive = false): Promise<void> {
		try {
			const response = await fetch(url, {
				method,
				headers: body ? { 'content-type': 'application/json' } : undefined,
				body,
				keepalive
			});
			// 401 is not authenticated, for instance a boot write while on /login. The route
			// guard handles auth, so it is not surfaced as a save error.
			if (response.status === 401) return;
			if (!response.ok) throw new Error(`HTTP ${response.status}`);
		} catch (error) {
			toast.error('Failed to save', {
				id: `save-error-${url}`,
				description: error instanceof Error ? error.message : 'Unknown error'
			});
		}
	}

	/** Flush any pending writes immediately (on page unload). */
	#flush(): void {
		for (const [url, timer] of this.#timers) {
			clearTimeout(timer);
			void this.#put(url, this.#pending.get(url), true);
		}
		this.#timers.clear();
		this.#pending.clear();
	}

	/**
	 * Send everything queued, now, and wait for it to land.
	 *
	 * The debounce is right for an edit and wrong for a creation: creating a
	 * conversation and navigating to it means reading back something still sitting
	 * in a timer. The read answers 404, the page starts a blank conversation over
	 * it, and the real one is gone.
	 */
	async flush(): Promise<void> {
		const queued = [...this.#pending];
		for (const timer of this.#timers.values()) clearTimeout(timer);
		this.#timers.clear();
		this.#pending.clear();
		await Promise.all(queued.map(([url, value]) => this.#put(url, value)));
	}
}
