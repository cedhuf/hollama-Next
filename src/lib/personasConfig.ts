import { derived, get, writable } from 'svelte/store';

import { env } from '$env/dynamic/public';
import { personasStore } from '$lib/localStorage';
import type { Persona } from '$lib/personas';

const isServer = env.PUBLIC_MODE === 'server';

export interface PersonasConfig {
	/** Personas an admin has shared, offered to users to "install". */
	shared: Persona[];
	/** Whether the current user may create their own personas. */
	canCreate: boolean;
	/**
	 * Where the instance reads its persona store, shown to everyone.
	 *
	 * Empty in local mode, where the address is the user's own preference and the
	 * store is fetched by the browser. In server mode it is the instance's, so a
	 * user sees it and only an admin can change it.
	 */
	storeUrl: string;
	/** Whether the current user may change that address. */
	canEditStore: boolean;
	/**
	 * What this person's store contains.
	 *
	 * `open` is the public catalogue plus what the instance offers; `curated` is
	 * what the instance offers and nothing else. An admin always gets `open`,
	 * because the catalogue is what they choose from.
	 */
	storeMode: 'open' | 'curated';
	/** Whether the current user may offer a persona to everyone on the instance. */
	canShare: boolean;
	/** The instance updates installed personas for everyone, whatever they chose. */
	autoUpdateForced: boolean;
	/**
	 * Whether personas may remember anything here.
	 *
	 * Off takes the tools away and stops the injection, so a persona on such an
	 * instance behaves exactly as it did before memory existed. Always on in local
	 * mode, where there is nobody to decide it for you.
	 */
	memoryEnabled: boolean;
	/**
	 * Store personas this instance relays, by catalogue id.
	 *
	 * References rather than copies, which is what keeps the catalogue showing one
	 * Maïté instead of two and what lets the store's next revision reach the people
	 * who took the instance's word for it.
	 */
	sharedFromStore: string[];
}

const DEFAULT: PersonasConfig = {
	shared: [],
	canCreate: true,
	storeUrl: '',
	canEditStore: false,
	// Local mode has one person, who is therefore allowed everything and has
	// nobody to share with.
	storeMode: 'open',
	canShare: false,
	autoUpdateForced: false,
	memoryEnabled: true,
	sharedFromStore: []
};

const serverPersonas = writable<PersonasConfig | null>(null);

export async function loadServerPersonas(): Promise<void> {
	if (!isServer) return;
	try {
		const response = await fetch('/api/personas/config');
		if (response.ok) serverPersonas.set(await response.json());
	} catch {
		/* leave null */
	}
}

/** The effective personas governance for the current user/mode. */
export const personasConfig = derived(serverPersonas, ($server): PersonasConfig =>
	isServer ? ($server ?? DEFAULT) : DEFAULT
);

/** Admin: point the instance at another persona store. */
export async function saveStoreUrl(url: string): Promise<void> {
	if (!isServer) return;
	await fetch('/api/admin/config', {
		method: 'PUT',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ storeUrl: url })
	});
	serverPersonas.update((c) => (c ? { ...c, storeUrl: url } : c));
}

/**
 * Admin: publish the personas they wrote and flagged `shared`.
 *
 * Only their own. What they relay from the store is a separate list of ids, so a
 * toggle here cannot disturb it, and their own edited copy of a store persona is
 * published from here like anything else they wrote.
 */
export async function publishSharedPersonas(): Promise<void> {
	if (!isServer) return;
	const shared = (get(personasStore) || [])
		.filter((p) => p.shared)
		.map((p) => ({ ...p, sessionId: undefined }));
	try {
		await fetch('/api/admin/personas', {
			method: 'PUT',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(shared)
		});
		await loadServerPersonas();
	} catch {
		/* ignore */
	}
}

/**
 * Admin: relay one of the store's personas, or stop.
 *
 * Nothing is installed and nothing is copied. Stopping does not take back what
 * people already installed, which is theirs.
 */
export async function relayCatalogPersona(id: string, relay: boolean): Promise<void> {
	if (!isServer) return;
	await fetch(`/api/admin/personas/store/${encodeURIComponent(id)}`, {
		method: relay ? 'PUT' : 'DELETE'
	});
	await loadServerPersonas();
}
