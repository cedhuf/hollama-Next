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
}

const DEFAULT: PersonasConfig = { shared: [], canCreate: true };

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

/**
 * Admin: publish the current set of shared personas to all users (a snapshot of
 * every persona flagged `shared`). Called whenever a share toggle changes.
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
		// Reflect locally so the admin's own view stays in sync without a reload.
		serverPersonas.update((c) => ({ canCreate: c?.canCreate ?? true, shared }));
	} catch {
		/* ignore */
	}
}
