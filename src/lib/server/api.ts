import { error, type RequestEvent } from '@sveltejs/kit';

import { env as publicEnv } from '$env/dynamic/public';

import type { Role } from './db/users';
import { sessionUser } from './session';

/**
 * Guard for `/api/data/*` endpoints: they only exist in server mode and require
 * an authenticated session. Returns the current user's id and role.
 */
export async function requireUser(event: RequestEvent): Promise<{ id: string; role: Role }> {
	if (publicEnv.PUBLIC_MODE !== 'server') throw error(404, 'Not found');

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
