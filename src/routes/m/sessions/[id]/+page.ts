import { repository } from '$lib/data';
import { newSession } from '$lib/sessions';

import type { PageLoad } from './$types';

/**
 * The conversation is read here, before the component exists.
 *
 * The list only carries summaries, so the messages have to be fetched, and
 * awaiting them in `load` is what keeps `session` a whole conversation from its
 * first line. A component that filled itself in later would, for those frames,
 * hold something indistinguishable from a conversation whose messages were lost,
 * and any save landing in that window would make it true.
 *
 * A failed read throws, which SvelteKit turns into an error page. `null` is
 * different: no such conversation yet, which is how a new chat begins.
 */
export const load = (async ({ params, fetch }) => {
	const stored = await repository.loadSession(params.id, fetch);
	return { id: params.id, session: stored ?? newSession(params.id) };
}) satisfies PageLoad;

/** The data lives behind the authenticated API, called from the browser, so the server produced an empty conversation that hydration immediately replaced. */
export const ssr = false;
