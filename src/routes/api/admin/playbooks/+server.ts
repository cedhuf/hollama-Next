import { error } from '@sveltejs/kit';

import type { Playbook } from '$lib/playbooks';
import { requireAdmin } from '$lib/server/api';
import { setSharedPlaybooks } from '$lib/server/db/sharedPlaybooks';

/**
 * The playbooks an admin wrote and offers, snapshotted whole. A replacement is
 * right here because the body answers "which of mine are flagged shared", which
 * is complete by construction. The relayed ones are not in this list.
 */
export async function PUT(event) {
	await requireAdmin(event);
	const body = await event.request.json();
	if (!Array.isArray(body)) throw error(400, 'Expected an array');

	setSharedPlaybooks(body as Playbook[]);
	return new Response(null, { status: 204 });
}
