import { error } from '@sveltejs/kit';

import type { Persona } from '$lib/personas';
import { requireAdmin } from '$lib/server/api';
import { setSharedPersonas } from '$lib/server/db/sharedPersonas';

/**
 * The personas an admin wrote and offers to their users, snapshotted whole.
 *
 * A replacement is right here, unlike everywhere else, because the body answers
 * "which of my personas are flagged shared", which is complete by construction.
 * The personas relayed from the store are not in this list at all.
 *
 * UI curation, not a security boundary.
 */
export async function PUT(event) {
	await requireAdmin(event);
	const body = await event.request.json();
	if (!Array.isArray(body)) throw error(400, 'Expected an array');

	setSharedPersonas(body as Persona[]);
	return new Response(null, { status: 204 });
}
