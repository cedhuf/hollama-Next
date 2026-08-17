import { error } from '@sveltejs/kit';

import { requireAdmin } from '$lib/server/api';
import { setCreditLimit } from '$lib/server/db/usage';
import { deleteUser, getUserById } from '$lib/server/db/users';

/**
 * One account's own allowance.
 *
 * `null` puts it back on the instance's, which is not the same as setting it to
 * the same number: the instance's can change afterwards, and an account that
 * inherits follows it.
 */
export async function PUT(event) {
	await requireAdmin(event);
	if (!getUserById(event.params.id)) throw error(404, 'User not found');

	const body = await event.request.json();
	if ('creditLimit' in (body ?? {})) {
		const raw = body.creditLimit;
		if (raw !== null && typeof raw !== 'number') throw error(400, 'creditLimit must be a number');
		setCreditLimit(event.params.id, raw);
	}

	return new Response(null, { status: 204 });
}

export async function DELETE(event) {
	const admin = await requireAdmin(event);
	if (event.params.id === admin.id) throw error(400, 'You cannot delete your own account');
	if (!getUserById(event.params.id)) throw error(404, 'User not found');

	deleteUser(event.params.id); // cascades: their servers, sessions, knowledge, settings
	return new Response(null, { status: 204 });
}
