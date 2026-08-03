import type { Server } from '$lib/connections';
import type { Knowledge } from '$lib/knowledge';
import type { Persona } from '$lib/personas';
import type { Session } from '$lib/sessions';
import type { Settings } from '$lib/settings';

import type { StorageKey } from './keys';

/**
 * The full set of app data, as held in memory by the reactive stores.
 * Returned synchronously by `DataRepository.hydrate()` in local mode so the
 * stores can seed without a loading flash.
 */
export interface AppData {
	settings: Settings;
	servers: Server[];
	sessions: Session[];
	knowledge: Knowledge[];
	personas: Persona[];
}

/**
 * A portable backup, keyed by `StorageKey` for backwards-compatibility with
 * files exported by earlier versions.
 */
export type Backup = Partial<Record<StorageKey, unknown>>;

/**
 * The single seam between the app and where its data lives.
 *
 * Components never touch storage directly — they read/write the reactive
 * stores, which delegate persistence here. Two implementations:
 *   - `LocalStorageRepository` (mode `local`): browser `localStorage`, sync.
 *   - `ApiRepository` (mode `server`): SvelteKit endpoints backed by SQLite.
 *
 * The interface is async so the server implementation fits without changing
 * any call sites. `hydrate()` is the one synchronous escape hatch: local mode
 * implements it to seed the stores instantly; async-only repos omit it and
 * rely on the `load*()` methods at boot.
 */
export interface DataRepository {
	/** Synchronous seed for no-flash local mode. Absent on async-only repos. */
	hydrate?(): AppData;

	loadSettings(): Promise<Settings | null>;
	loadServers(): Promise<Server[]>;
	loadSessions(): Promise<Session[]>;
	loadKnowledge(): Promise<Knowledge[]>;
	loadPersonas(): Promise<Persona[]>;

	saveSettings(value: Settings): Promise<void>;
	saveServers(value: Server[]): Promise<void>;

	/**
	 * Collections are written one item at a time.
	 *
	 * Handing over the whole array instead would describe a *value* ("here is the
	 * state of the world") where what happened is an *operation* ("this session
	 * changed"). A server given only the value has to infer removals from absence,
	 * so every save becomes delete-everything-and-reinsert: the cost of a write
	 * grows with the whole history, and any client holding a stale or partial list
	 * silently erases what the others added. Saying what actually changed costs the
	 * same in localStorage and is the only thing a database can implement safely.
	 */
	saveSession(session: Session): Promise<void>;
	deleteSession(id: string): Promise<void>;
	saveKnowledgeItem(knowledge: Knowledge): Promise<void>;
	deleteKnowledgeItem(id: string): Promise<void>;
	savePersona(persona: Persona): Promise<void>;
	deletePersona(id: string): Promise<void>;

	/**
	 * Wholesale replacement, for restoring a backup — the one case where the
	 * caller really does mean "this is now the entire collection".
	 */
	replaceSessions(sessions: Session[]): Promise<void>;
	replaceKnowledge(knowledge: Knowledge[]): Promise<void>;
	replacePersonas(personas: Persona[]): Promise<void>;

	exportBackup(): Promise<Backup>;
	importBackup(backup: Backup): Promise<void>;
	resetAll(): Promise<void>;
}
