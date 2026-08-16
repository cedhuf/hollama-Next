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
	 * Whether the current user may install from the store.
	 *
	 * Distinct from `canCreate`: one is about writing a persona, the other about
	 * taking one. An instance can want either without the other, so an admin has
	 * two switches rather than one that means both.
	 */
	canInstall: boolean;
	/** Whether the current user may offer a persona to everyone on the instance. */
	canShare: boolean;
}

const DEFAULT: PersonasConfig = {
	shared: [],
	canCreate: true,
	storeUrl: '',
	canEditStore: false,
	// Local mode has one person, who is therefore allowed everything and has
	// nobody to share with.
	canInstall: true,
	canShare: false
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
export const personasConfig = derived(
	serverPersonas,
	($server): PersonasConfig => (isServer ? ($server ?? DEFAULT) : DEFAULT)
);

/** Admin: point the instance at another persona store. */
export async function saveStoreUrl(url: string): Promise<void> {
	if (!isServer) return;
	await fetch('/api/admin/config', {
		method: 'PUT',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ personaStoreUrl: url })
	});
	serverPersonas.update((c) => (c ? { ...c, storeUrl: url } : c));
}

/**
 * Admin: republish what this library contributes to the shared set.
 *
 * The library's ids travel with it, and that is the whole of the change: the
 * server rewrites only those, so a persona shared straight from the store, which
 * is in nobody's library, is no longer wiped by the next toggle here.
 */
export async function publishSharedPersonas(): Promise<void> {
	if (!isServer) return;
	const library = get(personasStore) || [];
	const shared = library.filter((p) => p.shared).map((p) => ({ ...p, sessionId: undefined }));
	try {
		await fetch('/api/admin/personas', {
			method: 'PUT',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ shared, libraryIds: library.map((p) => p.id) })
		});
		await loadServerPersonas();
	} catch {
		/* ignore */
	}
}

/** Admin: offer a persona from the store, without installing it here first. */
export async function sharePersona(persona: Persona): Promise<void> {
	if (!isServer) return;
	await fetch('/api/admin/personas', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ ...persona, sessionId: undefined, shared: true })
	});
	await loadServerPersonas();
}

/** Admin: stop offering one. Copies already installed are not touched. */
export async function unsharePersona(id: string): Promise<void> {
	if (!isServer) return;
	await fetch(`/api/admin/personas/${id}`, { method: 'DELETE' });
	await loadServerPersonas();
}
