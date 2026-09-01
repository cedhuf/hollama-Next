import { derived, get, writable } from 'svelte/store';

import { personasStore } from '$lib/localStorage';
import type { Persona } from '$lib/personas';

export interface PersonasConfig {
	/** Personas an admin has shared, offered to users to "install". */
	shared: Persona[];
	/** Whether the current user may create their own personas. */
	canCreate: boolean;
	/** The instance's rather than each person's, so a user sees it and only an admin can change it. */
	storeUrl: string;
	/** Whether the current user may change that address. */
	canEditStore: boolean;
	/** `open` is the public catalogue plus what the instance offers; `curated` is what the instance offers alone. An admin always gets `open`, being what they choose from. */
	storeMode: 'open' | 'curated';
	/** Whether the current user may offer a persona to everyone on the instance. */
	canShare: boolean;
	/** The instance updates installed personas for everyone, whatever they chose. */
	autoUpdateForced: boolean;
	/** Off takes the tools away and stops the injection, so a persona behaves as it did before memory existed. Always on in local mode. */
	memoryEnabled: boolean;
	/** References rather than copies, which keeps the catalogue showing one Maïté instead of two and lets the next revision reach the people who took the instance's word for it. */
	sharedFromStore: string[];
}

const DEFAULT: PersonasConfig = {
	shared: [],
	canCreate: true,
	storeUrl: '',
	canEditStore: false,
	// Before the instance has answered: the permissive reading of what is shown, and
	// nothing shared, since sharing is the instance's to grant.
	storeMode: 'open',
	canShare: false,
	autoUpdateForced: false,
	memoryEnabled: true,
	sharedFromStore: []
};

const serverPersonas = writable<PersonasConfig | null>(null);

export async function loadServerPersonas(): Promise<void> {
	try {
		const response = await fetch('/api/personas/config');
		if (response.ok) serverPersonas.set(await response.json());
	} catch {
		/* leave null */
	}
}

/** The effective personas governance for the current user. */
export const personasConfig = derived(
	serverPersonas,
	($server): PersonasConfig => $server ?? DEFAULT
);

/** Admin: point the instance at another persona store. */
export async function saveStoreUrl(url: string): Promise<void> {
	await fetch('/api/admin/config', {
		method: 'PUT',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ storeUrl: url })
	});
	serverPersonas.update((c) => (c ? { ...c, storeUrl: url } : c));
}

/** Only their own. What they relay from the store is a separate list of ids, so a toggle here cannot disturb it. */
export async function publishSharedPersonas(): Promise<void> {
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

/** Nothing is installed and nothing is copied. Stopping does not take back what people already installed, which is theirs. */
export async function relayCatalogPersona(id: string, relay: boolean): Promise<void> {
	await fetch(`/api/admin/personas/store/${encodeURIComponent(id)}`, {
		method: relay ? 'PUT' : 'DELETE'
	});
	await loadServerPersonas();
}
