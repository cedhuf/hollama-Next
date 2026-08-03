import { toast } from 'svelte-sonner';

import { browser } from '$app/environment';
import type { Server } from '$lib/connections';
import type { ConversationResult } from '$lib/conversationSearch';
import type { Knowledge } from '$lib/knowledge';
import type { Persona } from '$lib/personas';
import { fetchProviders, providerToServer } from '$lib/providers';
import { normalizeSession, type Session, type SessionSummary } from '$lib/sessions';
import { DEFAULT_SETTINGS, type Settings } from '$lib/settings';

import type { Backup, DataRepository } from './repository';

type Collection = 'sessions' | 'knowledge' | 'personas' | 'settings';

const DEBOUNCE_MS = 800;

/**
 * Mode `server`: data lives in SQLite behind the guarded `/api/data` endpoints.
 *
 * Writes are debounced and coalesced per collection — the stores persist the
 * whole collection on every change (e.g. each streamed token), so without this
 * we'd PUT the entire session list dozens of times per message. Pending writes
 * are flushed on `pagehide` (with `keepalive`) so nothing is lost on close.
 *
 * No `hydrate()`: the stores seed with defaults and the layout fills them via
 * the async `load*()` methods at boot.
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

	/**
	 * A 404 means "no such conversation yet" — opening an unknown id is how a new
	 * chat begins. Anything else throws, so a server that is merely unreachable is
	 * never mistaken for an empty conversation.
	 */
	async loadSession(id: string): Promise<Session | null> {
		const response = await fetch(`/api/data/sessions/${id}`);
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

	/**
	 * Deletions are sent immediately, and cancel any write still queued for that
	 * item — a debounced save landing after its own delete would resurrect it.
	 */
	async deleteSession(id: string): Promise<void> {
		await this.#delete(`/api/data/sessions/${id}`);
	}
	async deleteKnowledgeItem(id: string): Promise<void> {
		await this.#delete(`/api/data/knowledge/${id}`);
	}
	async deletePersona(id: string): Promise<void> {
		await this.#delete(`/api/data/personas/${id}`);
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

	async saveServers(): Promise<void> {
		// TODO (step 5): persist a user's personal servers.
	}

	async searchSessions(query: string): Promise<ConversationResult[]> {
		const response = await fetch(`/api/search/sessions?q=${encodeURIComponent(query)}`);
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
	 * Reads a collection, or throws.
	 *
	 * It must never answer "empty" for "I could not tell". The stores persist the
	 * whole collection at once, so a failed read that returned `[]` would leave the
	 * store empty and the next save would replace every stored row with nothing —
	 * the caller has to be able to distinguish the two and leave the data alone.
	 * `null`/absent from the server is a genuine empty, and keeps the fallback.
	 */
	async #get<T>(collection: Collection, fallback: T): Promise<T> {
		const response = await fetch(`/api/data/${collection}`);
		if (!response.ok) throw new Error(`GET /api/data/${collection}: HTTP ${response.status}`);
		return ((await response.json()) as T) ?? fallback;
	}

	/**
	 * Coalesce writes per item, not per collection.
	 *
	 * A streaming answer saves its session on every chunk, so the debounce still
	 * earns its keep. Keying on the item's own URL means a burst on the open
	 * conversation is no longer merged with — or delayed by — an unrelated edit to
	 * another one.
	 */
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
			// 401 = not authenticated (e.g. a boot write while on /login). Benign;
			// the route guard handles auth, so don't surface it as a save error.
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
}
