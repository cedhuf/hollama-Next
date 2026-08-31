import { error, type RequestEvent } from '@sveltejs/kit';

import type { ServerRow } from './db/servers';
import type { Role } from './db/users';
import { isModelShared, PolicyError, reachableServer } from './llmPolicy';
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

/**
 * The model, which is the other half of the same question.
 *
 * Separate from `requireServer` because not every caller names one: the relay
 * finds the model in a body it is about to forward, and polices it there. Every
 * caller that *does* name one up front should ask this, and until now reading
 * aloud and transcription did not, which is how a model an administrator had
 * chosen not to share could be reached by anybody willing to name it.
 */
export function requireSharedModel(server: ServerRow, isAdmin: boolean, model: string): void {
	if (!isModelShared(server, isAdmin, model)) {
		throw error(403, `Model "${model}" is not shared on this server`);
	}
}

/**
 * The connection a request names, once it has earned the right to name it.
 *
 * Beside `requireUser` on purpose. A route that has established who is knocking
 * has done half the work, and the other half is which connection they may reach.
 * Answering the first and inventing the second is how a check drifts: four
 * copies is four chances for one of them to forget that a disabled server is
 * still a row in the table. The rule itself lives in `llmPolicy`, because a
 * request is not the only thing that asks any more.
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
