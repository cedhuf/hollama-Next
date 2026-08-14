import type { RequestEvent } from '@sveltejs/kit';

import { getUserById, type Role } from './db/users';

/**
 * The signed-in user, or null.
 *
 * A signed cookie proves a session was issued, not that its user still exists.
 * A deleted account, or a database replaced under a running browser, leaves a
 * valid token pointing at nothing: writes then reach SQLite and die on the
 * foreign key, which surfaces as a 500 the client can do nothing about. So the
 * row is what decides, and everything that asks "who is this" asks here.
 */
export async function sessionUser(event: {
	locals: RequestEvent['locals'];
}): Promise<{ id: string; role: Role } | null> {
	const session = await event.locals.auth();
	if (!session?.user?.id) return null;
	return getUserById(session.user.id) ? { id: session.user.id, role: session.user.role } : null;
}
