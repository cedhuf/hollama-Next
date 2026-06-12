import { toast } from 'svelte-sonner';

import { browser } from '$app/environment';
import type { Server } from '$lib/connections';
import type { Knowledge } from '$lib/knowledge';
import { fetchProviders, providerToServer } from '$lib/providers';
import type { Session } from '$lib/sessions';
import { DEFAULT_SETTINGS, type Settings } from '$lib/settings';

import type { Backup, DataRepository } from './repository';

type Collection = 'sessions' | 'knowledge' | 'settings';

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
	#timers = new Map<Collection, ReturnType<typeof setTimeout>>();
	#pending = new Map<Collection, unknown>();

	constructor() {
		if (browser) window.addEventListener('pagehide', () => this.#flush());
	}

	async loadSettings(): Promise<Settings | null> {
		const stored = await this.#get<Partial<Settings> | null>('settings', null);
		// Backfill any keys added since these settings were last saved (e.g. systemPrompts).
		return stored ? { ...DEFAULT_SETTINGS, ...stored } : null;
	}
	async loadSessions(): Promise<Session[]> {
		return this.#get<Session[]>('sessions', []);
	}
	async loadKnowledge(): Promise<Knowledge[]> {
		return this.#get<Knowledge[]>('knowledge', []);
	}
	async loadServers(): Promise<Server[]> {
		const { servers } = await fetchProviders(true);
		return servers.map(providerToServer);
	}

	async saveSettings(value: Settings): Promise<void> {
		this.#schedule('settings', value);
	}
	async saveSessions(value: Session[]): Promise<void> {
		this.#schedule('sessions', value);
	}
	async saveKnowledge(value: Knowledge[]): Promise<void> {
		this.#schedule('knowledge', value);
	}
	async saveServers(): Promise<void> {
		// TODO (step 5): persist a user's personal servers.
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

	async #get<T>(collection: Collection, fallback: T): Promise<T> {
		try {
			const response = await fetch(`/api/data/${collection}`);
			if (!response.ok) return fallback;
			return ((await response.json()) as T) ?? fallback;
		} catch {
			return fallback;
		}
	}

	#schedule(collection: Collection, value: unknown): void {
		this.#pending.set(collection, value);
		clearTimeout(this.#timers.get(collection));
		this.#timers.set(
			collection,
			setTimeout(() => {
				this.#timers.delete(collection);
				this.#pending.delete(collection);
				void this.#put(collection, value);
			}, DEBOUNCE_MS)
		);
	}

	async #put(collection: Collection, value: unknown, keepalive = false): Promise<void> {
		try {
			const response = await fetch(`/api/data/${collection}`, {
				method: 'PUT',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(value),
				keepalive
			});
			// 401 = not authenticated (e.g. a boot write while on /login). Benign;
			// the route guard handles auth, so don't surface it as a save error.
			if (response.status === 401) return;
			if (!response.ok) throw new Error(`HTTP ${response.status}`);
		} catch (error) {
			toast.error('Failed to save', {
				id: `save-${collection}-error`,
				description: error instanceof Error ? error.message : 'Unknown error'
			});
		}
	}

	/** Flush any pending writes immediately (on page unload). */
	#flush(): void {
		for (const [collection, timer] of this.#timers) {
			clearTimeout(timer);
			void this.#put(collection, this.#pending.get(collection), true);
		}
		this.#timers.clear();
		this.#pending.clear();
	}
}
