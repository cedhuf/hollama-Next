import type { Server } from '$lib/connections';
import type { ConversationResult } from '$lib/conversationSearch';
import type { Knowledge } from '$lib/knowledge';
import type { PersonaMemory } from '$lib/personaMemory';
import type { Persona } from '$lib/personas';
import type { Playbook } from '$lib/playbooks';
import type { Session, SessionSummary } from '$lib/sessions';
import type { Settings } from '$lib/settings';

import type { StorageKey } from './keys';

/**
 * Nobody is signed in.
 *
 * Distinct from a read that failed, because the two deserve opposite reactions:
 * a failure has to be shouted about, since an empty sidebar looks exactly like
 * an empty account. Being signed out is not a failure at all — the login page
 * asks the same questions as the app and would answer 401 to every one of them.
 * Saving still stays suspended either way.
 */
export class NotAuthenticatedError extends Error {
	constructor() {
		super('Not signed in');
		this.name = 'NotAuthenticatedError';
	}
}

/**
 * The full set of app data, as held in memory by the reactive stores.
 * Returned synchronously by `DataRepository.hydrate()` in local mode so the
 * stores can seed without a loading flash.
 */
export interface AppData {
	settings: Settings;
	servers: Server[];
	sessions: SessionSummary[];
	knowledge: Knowledge[];
	personas: Persona[];
	playbooks: Playbook[];
	personaMemory: PersonaMemory[];
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
	/** The conversation list: titles, dates and models — never the messages. */
	loadSessions(): Promise<SessionSummary[]>;
	/**
	 * One whole conversation, or `null` if there is no such conversation yet.
	 *
	 * Takes an optional `fetch` so a SvelteKit `load` can hand over its own: that
	 * one carries the request's cookies, is recorded for hydration, and doesn't
	 * make the browser repeat the call the server already made.
	 */
	loadSession(id: string, fetchFn?: typeof fetch): Promise<Session | null>;
	loadKnowledge(): Promise<Knowledge[]>;
	loadPersonas(): Promise<Persona[]>;
	loadPlaybooks(): Promise<Playbook[]>;
	/**
	 * What each persona remembers about the person signed in.
	 *
	 * Loaded whole rather than per persona: the always-present part of a memory is
	 * capped, so the whole set is small, and a turn must not wait on a round trip
	 * to find out what its persona knows.
	 */
	loadPersonaMemory(): Promise<PersonaMemory[]>;

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
	savePlaybook(playbook: Playbook): Promise<void>;
	deletePlaybook(id: string): Promise<void>;
	savePersonaMemory(memory: PersonaMemory): Promise<void>;
	deletePersonaMemory(personaId: string): Promise<void>;

	/**
	 * Wholesale replacement, for restoring a backup — the one case where the
	 * caller really does mean "this is now the entire collection".
	 */
	replaceSessions(sessions: Session[]): Promise<void>;
	replaceKnowledge(knowledge: Knowledge[]): Promise<void>;
	replacePersonas(personas: Persona[]): Promise<void>;
	replacePlaybooks(playbooks: Playbook[]): Promise<void>;
	replacePersonaMemory(memories: PersonaMemory[]): Promise<void>;

	/**
	 * Conversations matching a content search, best first.
	 *
	 * Server mode asks SQLite's full-text index; local mode scans what is already
	 * in memory. Same result shape either way — the caller doesn't get to know
	 * which, and the modal renders one thing.
	 */
	/** `everything` includes what a clear set aside and what a compaction replaced. */
	searchSessions(query: string, everything?: boolean): Promise<ConversationResult[]>;

	/**
	 * Land every queued write before going on.
	 *
	 * Called when what happens next reads back what was just written: creating a
	 * conversation and navigating to it, above all. Absent on repositories that do
	 * not queue, which is why it is optional rather than a no-op nobody can see.
	 */
	flush?(): Promise<void>;

	exportBackup(): Promise<Backup>;
	importBackup(backup: Backup): Promise<void>;
	resetAll(): Promise<void>;
}
