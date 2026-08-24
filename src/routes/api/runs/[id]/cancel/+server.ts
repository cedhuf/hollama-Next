import { error, json } from '@sveltejs/kit';

import { requireUser } from '$lib/server/api';
import { cancelRun, getRun, summarise } from '$lib/server/runs';

/** The stop button, which now has to reach a turn that is not in the page. */
export async function POST(event) {
	const userId = (await requireUser(event)).id;

	const run = getRun(event.params.id, userId);
	if (!run) throw error(404, 'No such run');

	cancelRun(run);
	return json(summarise(run));
}
