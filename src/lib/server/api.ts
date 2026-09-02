import { error, type RequestEvent } from '@sveltejs/kit';

import type { ServerRow } from './db/servers';
import type { Role } from './db/users';
import { isModelShared, PolicyError, reachableServer } from './llmPolicy';
import { sessionUser } from './session';

/** The API answers to a user, never to nobody. On an instance with no accounts that user is its implicit owner, which is settled in `sessionUser`. */
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

/**
 * Separate from `requireServer` because not every caller names a model: the
 * relay finds it in a body it is about to forward. Every caller that does name
 * one should ask this, and reading aloud and transcription did not, which is how
 * a model an administrator chose not to share could be reached by naming it.
 */
export function requireSharedModel(server: ServerRow, isAdmin: boolean, model: string): void {
	if (!isModelShared(server, isAdmin, model)) {
		throw error(403, `Model "${model}" is not shared on this server`);
	}
}

/**
 * The connection a request names, once it has earned the right to name it.
 *
 * Beside `requireUser` on purpose: a route that has established who is knocking
 * has done half the work. Four copies is four chances to forget that a disabled
 * server is still a row in the table. The rule itself lives in `llmPolicy`.
 */
export function requireServer(userId: string, serverId: unknown): ServerRow {
	try {
		return reachableServer(userId, serverId);
	} catch (cause) {
		// The rule is shared; only the way of refusing is this layer's own.
		if (cause instanceof PolicyError) throw error(cause.status, cause.message);
		throw cause;
	}
}
