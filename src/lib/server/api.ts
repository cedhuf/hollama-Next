import { error, type RequestEvent } from '@sveltejs/kit';

import type { Role } from './db/users';
import { sessionUser } from './session';

/**
 * Guard for the API: it answers to a user, never to nobody. On an instance with
 * no accounts that user is its implicit owner, which is settled in `sessionUser`
 * and is not this layer's business. Returns the current user's id and role.
 */
export async function requireUser(event: RequestEvent): Promise<{ id: string; role: Role }> {
	const user = await sessionUser(event);
	if (!user) throw error(401, 'Unauthorized');

	return user;
}

/** Like `requireUser`, but also requires the `admin` role. */
export async function requireAdmin(event: RequestEvent): Promise<{ id: string; role: Role }> {
	const user = await requireUser(event);
	if (user.role !== 'admin') throw error(403, 'Forbidden');
	return user;
}
