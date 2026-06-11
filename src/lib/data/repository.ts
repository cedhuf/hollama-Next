import type { Server } from '$lib/connections';
import type { Knowledge } from '$lib/knowledge';
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

	saveSettings(value: Settings): Promise<void>;
	saveServers(value: Server[]): Promise<void>;
	saveSessions(value: Session[]): Promise<void>;
	saveKnowledge(value: Knowledge[]): Promise<void>;

	exportBackup(): Promise<Backup>;
	importBackup(backup: Backup): Promise<void>;
	resetAll(): Promise<void>;
}
