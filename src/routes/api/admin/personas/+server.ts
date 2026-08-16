import { error } from '@sveltejs/kit';

import type { Persona } from '$lib/personas';
import { requireAdmin } from '$lib/server/api';
import { setSharedPersonas } from '$lib/server/db/sharedPersonas';

/**
 * The personas an admin wrote and offers to their users, snapshotted whole.
 *
 * A replacement is the right operation here, unlike everywhere else, because the
 * body is the answer to "which of my personas are flagged shared" and that is a
 * complete answer by construction. The personas relayed from the store are not
 * in this list at all, so nothing of theirs is at stake.
 *
 * UI curation, not a security boundary (see the roadmap on server-side enforcement).
 */
export async function PUT(event) {
	await requireAdmin(event);
	const body = await event.request.json();
	if (!Array.isArray(body)) throw error(400, 'Expected an array');

	setSharedPersonas(body as Persona[]);
	return new Response(null, { status: 204 });
}
