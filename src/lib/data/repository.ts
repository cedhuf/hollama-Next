import type { Server } from '$lib/connections';
import type { ConversationResult } from '$lib/conversationSearch';
import type { Knowledge } from '$lib/knowledge';
import type { PersonaMemory } from '$lib/personaMemory';
import type { Persona } from '$lib/personas';
import type { Playbook } from '$lib/playbooks';
import type { Session, SessionSummary } from '$lib/sessions';
import type { Settings } from '$lib/settings';

import type { StorageKey } from './keys';

/** Distinct from a read that failed: a failure has to be shouted about, since an empty sidebar looks like an empty account, while being signed out is not a failure at all. Saving stays suspended either way. */
export class NotAuthenticatedError extends Error {
	constructor() {
		super('Not signed in');
		this.name = 'NotAuthenticatedError';
	}
}

/** The full set of app data, as held in memory by the reactive stores. */
export interface AppData {
	settings: Settings;
	servers: Server[];
	sessions: SessionSummary[];
	knowledge: Knowledge[];
	personas: Persona[];
	playbooks: Playbook[];
	personaMemory: PersonaMemory[];
}

/** A portable backup, keyed by `StorageKey` for compatibility with files exported by earlier versions. */
export type Backup = Partial<Record<StorageKey, unknown>>;

/**
 * The single seam between the app and where its data lives. Components read and
 * write the reactive stores, which delegate persistence here. Asynchronous
 * throughout, so the stores are filled by the `load*()` methods at boot.
 */
export interface DataRepository {
	loadSettings(): Promise<Settings | null>;
	loadServers(): Promise<Server[]>;
	/** The conversation list: titles, dates and models. Never the messages. */
	loadSessions(): Promise<SessionSummary[]>;
	/** Takes an optional `fetch` so a SvelteKit `load` can hand over its own: that one carries the request's cookies and is recorded for hydration. */
	loadSession(id: string, fetchFn?: typeof fetch): Promise<Session | null>;
	loadKnowledge(): Promise<Knowledge[]>;
	loadPersonas(): Promise<Persona[]>;
	loadPlaybooks(): Promise<Playbook[]>;
	/** Loaded whole rather than per persona: the always-present part is capped, so the set is small, and a turn must not wait on a round trip to find out what its persona knows. */
	loadPersonaMemory(): Promise<PersonaMemory[]>;

	saveSettings(value: Settings): Promise<void>;
	saveServers(value: Server[]): Promise<void>;

	/**
	 * Collections are written one item at a time.
	 *
	 * The whole array would describe a *value* where what happened is an
	 * *operation*. A server given only the value infers removals from absence, so
	 * every save becomes delete-everything-and-reinsert, and any client holding a
	 * stale list silently erases what the others added.
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

	/** Wholesale replacement, for restoring a backup: the one case where the caller really does mean "this is now the entire collection". */
	replaceSessions(sessions: Session[]): Promise<void>;
	replaceKnowledge(knowledge: Knowledge[]): Promise<void>;
	replacePersonas(personas: Persona[]): Promise<void>;
	replacePlaybooks(playbooks: Playbook[]): Promise<void>;
	replacePersonaMemory(memories: PersonaMemory[]): Promise<void>;

	/** From SQLite's full-text index, best first. `everything` includes what a clear set aside and what a compaction replaced. */
	searchSessions(query: string, everything?: boolean): Promise<ConversationResult[]>;

	/** Called when what happens next reads back what was just written, above all creating a conversation and navigating to it. Absent on repositories that do not queue. */
	flush?(): Promise<void>;

	exportBackup(): Promise<Backup>;
	importBackup(backup: Backup): Promise<void>;
	resetAll(): Promise<void>;
}
