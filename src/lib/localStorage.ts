import { writable } from 'svelte/store';

import { browser } from '$app/environment';
import type { Server } from '$lib/connections';
import type { Knowledge } from '$lib/knowledge';
import type { PersonaMemory } from '$lib/personaMemory';
import type { Persona } from '$lib/personas';
import type { Playbook } from '$lib/playbooks';
import type { Session } from '$lib/sessions';
import { summarizeSession, type SessionSummary } from '$lib/sessionShape';
import { DEFAULT_SETTINGS, type Settings } from '$lib/settings';
import { toast } from '$lib/toast';

import { repository } from './data';
import { NotAuthenticatedError } from './data/repository';

// Re-exported so existing call sites keep importing these from `$lib/localStorage`.
export { LOCAL_STORAGE_PREFIX, StorageKey } from './data/keys';

/** Persistence is suspended until the first hydration completes: the stores load asynchronously, and any write before that would PUT empty defaults over the stored data. */
let persistenceReady = false;

/**
 * A writable store that persists every change through the active repository.
 *
 * The first synchronous emission is skipped: there is nothing new to persist,
 * and in server mode persisting the empty seed would clobber the stored data.
 * `setQuiet()` hydrates without persisting; `reset()` returns to `defaultValue`.
 */
function persistedStore<T>(seed: T, defaultValue: T, save: (value: T) => Promise<void>) {
	const store = writable<T>(seed);
	let initialized = false;
	let suppress = false;

	if (browser) {
		store.subscribe((value) => {
			if (!initialized) {
				initialized = true;
				return;
			}
			if (!persistenceReady || suppress) return;
			void save(value);
		});
	}

	return {
		subscribe: store.subscribe,
		set: store.set,
		update: store.update,
		reset: () => store.set(defaultValue),
		setQuiet: (value: T) => {
			suppress = true;
			store.set(value);
			suppress = false;
		}
	};
}

/**
 * A collection of identified items, persisted one item at a time.
 *
 * `persistedStore` persists whatever the store holds, which for a collection
 * makes "this session changed" and "these are the only sessions left" the same
 * write. Here the operation is explicit: `upsert` saves one, `remove` deletes
 * one, and the in-memory array is kept in step.
 *
 * `setQuiet` fills from storage without writing back; `replaceAll` is the
 * deliberate wholesale write, for restoring a backup.
 */
function collectionStore<
	T extends { id: string },
	S extends { id: string; updatedAt?: string } = T & { updatedAt?: string }
>(
	seed: S[],
	ops: {
		save: (item: T) => Promise<void>;
		remove: (id: string) => Promise<void>;
		replaceAll: (items: T[]) => Promise<void>;
		/** Identity for most collections; for conversations it drops the messages, which the lists never read and which would sit in memory in their entirety. */
		summarize: (item: T) => S;
	}
) {
	const store = writable<S[]>(seed);

	/** For changes somebody else has already stored: a turn written by the server has to reach the lists this store feeds, while saving it from here would be this tab writing over a row it does not own. */
	const reflect = (item: T) => {
		const summary = ops.summarize(item);
		store.update((items) => {
			const index = items.findIndex((existing) => existing.id === summary.id);
			const next = index === -1 ? [...items, summary] : items.with(index, summary);
			return sortStore(next);
		});
	};

	return {
		subscribe: store.subscribe,
		setQuiet: (items: S[]) => store.set(items),
		reflect,

		upsert: (item: T) => {
			reflect(item);
			if (persistenceReady) void ops.save(item);
		},

		remove: (id: string) => {
			store.update((items) => items.filter((item) => item.id !== id));
			if (persistenceReady) void ops.remove(id);
		},

		replaceAll: (items: T[]) => {
			store.set(items.map(ops.summarize));
			if (persistenceReady) void ops.replaceAll(items);
		},

		reset: () => {
			store.set([]);
			if (persistenceReady) void ops.replaceAll([]);
		}
	};
}

export function sortStore<T extends { updatedAt?: string }>(store: T[]) {
	return store.sort((a, b) => {
		if (!a.updatedAt && !b.updatedAt) return 0;
		if (!a.updatedAt) return 1;
		if (!b.updatedAt) return -1;
		return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
	});
}

const seed = {
	settings: DEFAULT_SETTINGS,
	servers: [] as Server[],
	sessions: [] as SessionSummary[],
	knowledge: [] as Knowledge[],
	personas: [] as Persona[],
	playbooks: [] as Playbook[],
	personaMemory: [] as PersonaMemory[]
};

export const settingsStore = persistedStore<Settings>(seed.settings, DEFAULT_SETTINGS, (v) =>
	repository.saveSettings(v)
);
export const serversStore = persistedStore<Server[]>(seed.servers, [], (v) =>
	repository.saveServers(v)
);
export const sessionsStore = collectionStore<Session, SessionSummary>(seed.sessions, {
	save: (session) => repository.saveSession(session),
	remove: (id) => repository.deleteSession(id),
	replaceAll: (sessions) => repository.replaceSessions(sessions),
	summarize: summarizeSession
});
export const knowledgeStore = collectionStore<Knowledge>(seed.knowledge, {
	save: (knowledge) => repository.saveKnowledgeItem(knowledge),
	remove: (id) => repository.deleteKnowledgeItem(id),
	replaceAll: (knowledge) => repository.replaceKnowledge(knowledge),
	summarize: (knowledge) => knowledge
});
export const personasStore = collectionStore<Persona>(seed.personas, {
	save: (persona) => repository.savePersona(persona),
	remove: (id) => repository.deletePersona(id),
	replaceAll: (personas) => repository.replacePersonas(personas),
	summarize: (persona) => persona
});
/** Keyed by the persona's id and deliberately not a field on the persona: a persona an admin shares is one object everybody reads, and a memory on it would be everybody's. */
export const personaMemoryStore = collectionStore<PersonaMemory>(seed.personaMemory, {
	save: (memory) => repository.savePersonaMemory(memory),
	remove: (id) => repository.deletePersonaMemory(id),
	replaceAll: (memories) => repository.replacePersonaMemory(memories),
	summarize: (memory) => memory
});
export const playbooksStore = collectionStore<Playbook>(seed.playbooks, {
	save: (playbook) => repository.savePlaybook(playbook),
	remove: (id) => repository.deletePlaybook(id),
	replaceAll: (playbooks) => repository.replacePlaybooks(playbooks),
	summarize: (playbook) => playbook
});

/** Each collection is loaded over the network and set quietly, without writing anything back. */
export async function hydrateStores(): Promise<void> {
	try {
		await loadIntoStores();
	} catch (error) {
		// Persistence stays suspended: the stores hold their empty seed, and a write now
		// would replace the user's stored collections with it.
		reportLoadFailure(error);
		return;
	}
	// Only now may writes reach the server: the stores hold real data.
	persistenceReady = true;
}

/**
 * Re-read everything, for an app that has been running while the data moved.
 *
 * The stores are filled once at boot, which is right for a page that lives as
 * long as its data. A PWA is suspended and resumed for days, so conversations
 * written elsewhere never appeared until it was force-quit.
 *
 * Settings and servers are left alone: they are edited in place, and replacing
 * them under an open field would throw away what is being typed.
 */
export async function refreshStores(): Promise<void> {
	if (!browser) return;

	// Never before the boot hydration: the stores would be filled with data the app
	// is not yet allowed to write back.
	if (!persistenceReady) return;

	// A refresh that fails must change nothing. This runs when the app comes back to
	// the foreground, typically right after the server restarted under it, so a
	// failed read is the expected case. Emptying the stores here would arm the next
	// `saveSession` to replace every stored session with the one on screen.
	let sessions: SessionSummary[],
		knowledge: Knowledge[],
		personas: Persona[],
		playbooks: Playbook[],
		personaMemory: PersonaMemory[];
	try {
		[sessions, knowledge, personas, playbooks, personaMemory] = await Promise.all([
			repository.loadSessions(),
			repository.loadKnowledge(),
			repository.loadPersonas(),
			repository.loadPlaybooks(),
			repository.loadPersonaMemory()
		]);
	} catch (error) {
		reportLoadFailure(error);
		return;
	}

	sessionsStore.setQuiet(sessions);
	knowledgeStore.setQuiet(knowledge);
	personasStore.setQuiet(personas);
	personaMemoryStore.setQuiet(personaMemory);
	playbooksStore.setQuiet(playbooks);
}

/** Silence is what makes the failure dangerous: an empty sidebar looks like an empty account, and carrying on typing is what used to destroy the rest. */
function reportLoadFailure(error: unknown): void {
	// Signed out is not a failure: the login page boots the same stores and would
	// otherwise greet every visitor with an alarm.
	if (error instanceof NotAuthenticatedError) return;

	toast.error('Could not load your data', {
		id: 'data-load-error',
		description: `${error instanceof Error ? error.message : 'Unknown error'}: saving is paused; reload once the server is back.`,
		persist: true
	});
}

/** The network load shared by the boot and the refresh. */
async function loadIntoStores(): Promise<void> {
	const [settings, servers, sessions, knowledge, personas, playbooks, personaMemory] =
		await Promise.all([
			repository.loadSettings(),
			repository.loadServers(),
			repository.loadSessions(),
			repository.loadKnowledge(),
			repository.loadPersonas(),
			repository.loadPlaybooks(),
			repository.loadPersonaMemory()
		]);

	if (settings) settingsStore.setQuiet(settings);
	serversStore.setQuiet(servers);
	sessionsStore.setQuiet(sessions);
	knowledgeStore.setQuiet(knowledge);
	personasStore.setQuiet(personas);
	personaMemoryStore.setQuiet(personaMemory);
	playbooksStore.setQuiet(playbooks);
}
