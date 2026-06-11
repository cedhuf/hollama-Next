import { error } from '@sveltejs/kit';

import { requireAdmin } from '$lib/server/api';
import { deleteUser, getUserById } from '$lib/server/db/users';

export async function DELETE(event) {
	const admin = await requireAdmin(event);
	if (event.params.id === admin.id) throw error(400, 'You cannot delete your own account');
	if (!getUserById(event.params.id)) throw error(404, 'User not found');

	deleteUser(event.params.id); // cascades: their servers, sessions, knowledge, settings
	return new Response(null, { status: 204 });
}
