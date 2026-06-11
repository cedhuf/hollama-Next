import { error, type RequestEvent } from '@sveltejs/kit';

import { env as publicEnv } from '$env/dynamic/public';

import type { Role } from './db/users';

/**
 * Guard for `/api/data/*` endpoints: they only exist in server mode and require
 * an authenticated session. Returns the current user's id and role.
 */
export async function requireUser(event: RequestEvent): Promise<{ id: string; role: Role }> {
	if (publicEnv.PUBLIC_MODE !== 'server') throw error(404, 'Not found');

	const session = await event.locals.auth();
	if (!session?.user?.id) throw error(401, 'Unauthorized');

	return { id: session.user.id, role: session.user.role };
}
