import { error, json } from '@sveltejs/kit';

import { env as publicEnv } from '$env/dynamic/public';
import { requireUser } from '$lib/server/api';
import { cancelRun, getRun, summarise } from '$lib/server/runs';

/** The stop button, which now has to reach a turn that is not in the page. */
export async function POST(event) {
	const userId = publicEnv.PUBLIC_MODE === 'server' ? (await requireUser(event)).id : null;

	const run = getRun(event.params.id, userId);
	if (!run) throw error(404, 'No such run');

	cancelRun(run);
	return json(summarise(run));
}
