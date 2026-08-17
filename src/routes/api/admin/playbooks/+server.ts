import { error } from '@sveltejs/kit';

import type { Playbook } from '$lib/playbooks';
import { requireAdmin } from '$lib/server/api';
import { setSharedPlaybooks } from '$lib/server/db/sharedPlaybooks';

/**
 * The playbooks an admin wrote and offers to their users, snapshotted whole.
 *
 * A replacement is the right operation here, unlike everywhere else, because the
 * body is the answer to "which of my playbooks are flagged shared" and that is a
 * complete answer by construction. The ones relayed from the store are not in
 * this list at all, so nothing of theirs is at stake.
 */
export async function PUT(event) {
	await requireAdmin(event);
	const body = await event.request.json();
	if (!Array.isArray(body)) throw error(400, 'Expected an array');

	setSharedPlaybooks(body as Playbook[]);
	return new Response(null, { status: 204 });
}
