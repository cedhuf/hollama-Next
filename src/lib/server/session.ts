import type { RequestEvent } from '@sveltejs/kit';

import { accountsEnabled } from './authMode';
import { createUser, getFirstAdmin, getUserById, touchLastSeen, type Role } from './db/users';

/** Not shown anywhere: an instance with no accounts hands the profile its email field back. This is only what the row needs, since every account is keyed by an address. */
const IMPLICIT_OWNER_EMAIL = 'owner@localhost';

/**
 * The one account an instance without accounts runs as.
 *
 * Nobody signs in, but the data still has to belong to somebody: every row is
 * keyed by a user id, and a nullable owner on every table would be a lot of
 * machinery to express "one person".
 *
 * Created on the first request rather than at boot, so running a migration does
 * not write a user into the database. The id is remembered per process and
 * re-read from the row, since the database underneath can be replaced.
 */
let ownerId: string | null = null;

export function implicitOwner(): { id: string; role: Role } {
	if (ownerId) {
		const known = getUserById(ownerId);
		if (known) return { id: known.id, role: 'admin' };
		ownerId = null;
	}

	const owner =
		getFirstAdmin() ??
		createUser({ email: IMPLICIT_OWNER_EMAIL, role: 'admin', passwordHash: null });
	ownerId = owner.id;
	return { id: owner.id, role: 'admin' };
}

/**
 * The signed-in user, or null.
 *
 * A signed cookie proves a session was issued, not that its user still exists: a
 * deleted account leaves a valid token pointing at nothing, and writes then die
 * on the foreign key as a 500 the client can do nothing about. So the row
 * decides, and everything that asks "who is this" asks here.
 *
 * Which is why the instance with no accounts answers from here rather than from
 * a branch in every caller. `null` means signed out, never "no login here".
 */
export async function sessionUser(event: {
	locals: RequestEvent['locals'];
}): Promise<{ id: string; role: Role } | null> {
	// Before touching `locals.auth`, which the Auth.js handle installs and which is
	// therefore absent when there is no login to install it for.
	if (!accountsEnabled()) return implicitOwner();

	const session = await event.locals.auth();
	if (!session?.user?.id) return null;
	if (!getUserById(session.user.id)) return null;

	// Here because this is the one place that answers "who is this": a route cannot
	// forget to do it.
	touchLastSeen(session.user.id);

	return { id: session.user.id, role: session.user.role };
}
