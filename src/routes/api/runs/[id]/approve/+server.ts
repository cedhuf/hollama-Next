import { error, json } from '@sveltejs/kit';

import { requireUser } from '$lib/server/api';
import { decideApproval, getRun } from '$lib/server/runs';

/**
 * Allow or refuse one MCP call a turn is stopped on.
 *
 * Its own route rather than something carried back up the event stream, which
 * only goes one way, and because the answer has to be attributable: it is
 * checked against the account that owns the run. A question about somebody
 * else's turn is a 404, so nothing here confirms that a run exists.
 */
export async function POST(event) {
	const userId = (await requireUser(event)).id;

	const run = getRun(event.params.id, userId);
	if (!run) throw error(404, 'No such run');

	const body = await event.request.json().catch(() => null);
	const callId = typeof body?.callId === 'string' ? body.callId : '';
	if (!callId || typeof body?.allow !== 'boolean') throw error(400, 'Expected callId and allow');

	// False when the question has already been answered, timed out, or was never
	// asked. Not an error: two tabs answering at once is ordinary, and the first
	// answer is the one that counts.
	return json({ answered: decideApproval(run, callId, body.allow) });
}
