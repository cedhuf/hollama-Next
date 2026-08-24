import type { RequestEvent } from '@sveltejs/kit';

import { accountsEnabled } from './authMode';
import { createUser, getFirstAdmin, getUserById, touchLastSeen, type Role } from './db/users';

/**
 * The address the implicit owner is filed under.
 *
 * Not shown anywhere: an instance with no accounts hands the profile its email
 * field back, exactly as it was before there were accounts to own one. This is
 * only what the row needs so it can have one, since every account is keyed by an
 * address.
 */
const IMPLICIT_OWNER_EMAIL = 'owner@localhost';

/**
 * The one account an instance without accounts runs as.
 *
 * Nobody signs in, but the data still has to belong to somebody: every row in
 * the database is keyed by a user id, and the alternative (a nullable owner on
 * every table, and a second shape for every query) would be a lot of machinery
 * to express "one person". So the person is real, they simply never had to prove
 * who they are.
 *
 * Created on the first request rather than at boot, so that starting the process
 * to run a migration or a build does not write a user into the database.
 *
 * The id is remembered per process because this is called on every request, and
 * re-read from the row when it is, since the database underneath can be replaced.
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
 * A signed cookie proves a session was issued, not that its user still exists.
 * A deleted account, or a database replaced under a running browser, leaves a
 * valid token pointing at nothing: writes then reach SQLite and die on the
 * foreign key, which surfaces as a 500 the client can do nothing about. So the
 * row is what decides, and everything that asks "who is this" asks here.
 *
 * Which is also why the instance that has no accounts answers from here and not
 * from a branch in every caller: there is one question, and it has an answer
 * either way. `null` then means signed out, never "this instance has no login".
 */
export async function sessionUser(event: {
	locals: RequestEvent['locals'];
}): Promise<{ id: string; role: Role } | null> {
	// Before touching `locals.auth`, which the Auth.js handle installs and which
	// is therefore absent when there is no login to install it for.
	if (!accountsEnabled()) return implicitOwner();

	const session = await event.locals.auth();
	if (!session?.user?.id) return null;
	if (!getUserById(session.user.id)) return null;

	// Here because this is the one place that answers "who is this": a route cannot
	// forget to do it, and a route that never asks has nobody to record.
	touchLastSeen(session.user.id);

	return { id: session.user.id, role: session.user.role };
}
