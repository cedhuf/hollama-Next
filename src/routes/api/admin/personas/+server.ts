import { error } from '@sveltejs/kit';

import type { Persona } from '$lib/personas';
import { requireAdmin } from '$lib/server/api';
import { syncSharedFromLibrary, upsertSharedPersona } from '$lib/server/db/sharedPersonas';

// The instance's set of shared personas. This is UI curation, not a security
// boundary (see the roadmap on server-side enforcement).

/**
 * Republish what the admin's library contributes.
 *
 * Not a wholesale replacement any more: the body carries the shared personas and
 * the ids of every persona in that library, and only those ids are rewritten.
 * Anything shared straight from the store is not in that library and survives,
 * which under the old rule it did not.
 */
export async function PUT(event) {
	await requireAdmin(event);
	const body = await event.request.json();

	// The array form is what older clients send. Read as "this library holds
	// exactly what it is sharing", which is what that request meant at the time.
	const shared: Persona[] = Array.isArray(body) ? body : body?.shared;
	if (!Array.isArray(shared)) throw error(400, 'Expected an array of personas');

	const libraryIds: string[] = Array.isArray(body?.libraryIds)
		? body.libraryIds.filter((id: unknown): id is string => typeof id === 'string')
		: shared.map((persona) => persona.id);

	syncSharedFromLibrary(shared, libraryIds);
	return new Response(null, { status: 204 });
}

/** Share one persona that the admin does not own: straight from the store. */
export async function POST(event) {
	await requireAdmin(event);
	const persona = (await event.request.json()) as Persona;
	if (!persona?.id || typeof persona.name !== 'string') throw error(400, 'Expected a persona');

	upsertSharedPersona(persona);
	return new Response(null, { status: 204 });
}
