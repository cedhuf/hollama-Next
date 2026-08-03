import { toast } from 'svelte-sonner';
import { writable } from 'svelte/store';

import { browser } from '$app/environment';
import type { Server } from '$lib/connections';
import type { Knowledge } from '$lib/knowledge';
import type { Persona } from '$lib/personas';
import type { Session } from '$lib/sessions';
import { summarizeSession, type SessionSummary } from '$lib/sessionShape';
import { DEFAULT_SETTINGS, type Settings } from '$lib/settings';

import { repository } from './data';

// Re-exported so existing call sites keep importing these from `$lib/localStorage`.
export { LOCAL_STORAGE_PREFIX, StorageKey } from './data/keys';

/**
 * Persistence is suspended until the first hydration completes. In server mode
 * the stores load asynchronously, and any write before that finishes (a page
 * creating a session, the model-list cache, a default theme…) would PUT
 * empty/default values and clobber the server data — the cause of data vanishing
 * on refresh. Local mode hydrates synchronously, so it's ready immediately.
 */
let persistenceReady = !!repository.hydrate;

/**
 * A writable store that persists every change through the active repository.
 *
 * The very first (synchronous) emission — the seed echo — is skipped: there's
 * nothing new to persist, and in server mode persisting the empty seed before
 * async hydration would clobber the user's server-side data. `setQuiet()` sets
 * the value without persisting, used to hydrate from the repository at boot.
 * `reset()` returns the store to `defaultValue`.
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
 * `persistedStore` above persists whatever the store now holds, which is right
 * for a single value (the settings) and wrong for a collection: the array is all
 * the repository ever sees, so "this session changed" and "these are the only
 * sessions left" become the same write. Here the operation is explicit —
 * `upsert` saves one item, `remove` deletes one item — and the in-memory array
 * is kept in step for the components reading it.
 *
 * `setQuiet` fills the store from storage without writing anything back;
 * `replaceAll` is the deliberate wholesale write, used when restoring a backup.
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
		/**
		 * What the store keeps of an item. Identity for most collections; for
		 * conversations it drops the messages, which the lists never read and which
		 * would otherwise sit in memory in their entirety.
		 */
		summarize: (item: T) => S;
	}
) {
	const store = writable<S[]>(seed);

	return {
		subscribe: store.subscribe,
		setQuiet: (items: S[]) => store.set(items),

		upsert: (item: T) => {
			const summary = ops.summarize(item);
			store.update((items) => {
				const index = items.findIndex((existing) => existing.id === summary.id);
				const next = index === -1 ? [...items, summary] : items.with(index, summary);
				return sortStore(next);
			});
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

const seed = repository.hydrate?.() ?? {
	settings: DEFAULT_SETTINGS,
	servers: [] as Server[],
	sessions: [] as SessionSummary[],
	knowledge: [] as Knowledge[],
	personas: [] as Persona[]
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

/**
 * Fill the stores from the repository at boot. A no-op in local mode (the seed
 * is already synchronous via `hydrate()`); in server mode it loads each
 * collection over the network and sets the stores quietly (no write-back).
 */
export async function hydrateStores(): Promise<void> {
	if (repository.hydrate) return; // local mode: already seeded synchronously, ready

	try {
		await loadIntoStores();
	} catch (error) {
		// Persistence stays suspended. The stores still hold their empty seed, and
		// letting a write out now would replace the user's stored collections with
		// it — the boot equivalent of the refresh wipe guarded against below.
		reportLoadFailure(error);
		return;
	}
	// Only now may writes reach the server — the stores hold real data.
	persistenceReady = true;
}

/**
 * Re-read everything, for an app that has been running while the data moved.
 *
 * The stores are filled once at boot and never again, which is right for a page
 * that lives as long as its data. A PWA doesn't: it is suspended and resumed for
 * days, so conversations written from the browser — or from another device
 * against the same server — never appeared until it was force-quit. Called when
 * the app comes back to the foreground.
 *
 * Unlike `hydrateStores` this also refreshes local mode, where a second window
 * writing to the same localStorage leaves the first one just as stale.
 *
 * Settings and servers are deliberately left alone: they are edited in place in
 * the Settings modal, and replacing them under an open field would throw away
 * what is being typed. Only the collections the user browses are re-read.
 */
export async function refreshStores(): Promise<void> {
	if (!browser) return;

	const local = repository.hydrate?.();
	if (local) {
		sessionsStore.setQuiet(local.sessions);
		knowledgeStore.setQuiet(local.knowledge);
		personasStore.setQuiet(local.personas);
		return;
	}

	// Never before the boot hydration has completed: the stores would be filled
	// with data the app isn't yet allowed to write back.
	if (!persistenceReady) return;

	// A refresh that fails must change nothing. This runs when the app comes back
	// to the foreground — typically right after the server restarted under it, so
	// the read failing is the expected case, not the exotic one. Emptying the
	// stores here would arm the next `saveSession` to replace every stored session
	// with the single one still open on screen.
	let sessions: SessionSummary[], knowledge: Knowledge[], personas: Persona[];
	try {
		[sessions, knowledge, personas] = await Promise.all([
			repository.loadSessions(),
			repository.loadKnowledge(),
			repository.loadPersonas()
		]);
	} catch (error) {
		reportLoadFailure(error);
		return;
	}

	sessionsStore.setQuiet(sessions);
	knowledgeStore.setQuiet(knowledge);
	personasStore.setQuiet(personas);
}

/**
 * Tell the user their data could not be read.
 *
 * Silence here is what makes the failure dangerous: an empty sidebar looks like
 * an empty account, and the natural reaction — carry on typing — is what used to
 * destroy the rest. Saving is off until a load succeeds, so say so.
 */
function reportLoadFailure(error: unknown): void {
	toast.error('Could not load your data', {
		id: 'data-load-error',
		description: `${error instanceof Error ? error.message : 'Unknown error'} — saving is paused; reload once the server is back.`,
		duration: Number.POSITIVE_INFINITY
	});
}

/** The network load shared by the boot and the refresh. */
async function loadIntoStores(): Promise<void> {
	const [settings, servers, sessions, knowledge, personas] = await Promise.all([
		repository.loadSettings(),
		repository.loadServers(),
		repository.loadSessions(),
		repository.loadKnowledge(),
		repository.loadPersonas()
	]);

	if (settings) settingsStore.setQuiet(settings);
	serversStore.setQuiet(servers);
	sessionsStore.setQuiet(sessions);
	knowledgeStore.setQuiet(knowledge);
	personasStore.setQuiet(personas);
}
