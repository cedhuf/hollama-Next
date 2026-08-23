import { repository } from '$lib/data';
import { newSession } from '$lib/sessions';

import type { PageLoad } from './$types';

/**
 * The conversation is read here, before the component exists.
 *
 * The list only carries summaries now, so the messages have to be fetched, and
 * awaiting them in `load` rather than inside the component is what keeps
 * `session` a whole conversation from its very first line. A component that
 * started empty and filled itself in later would, for those few frames, hold
 * something indistinguishable from a conversation whose messages were lost, and
 * any save landing in that window would make it true.
 *
 * A failed read throws, which SvelteKit turns into an error page. Refusing to
 * open is right; quietly showing an empty conversation over a real one is not.
 * `null` is different. It means no such conversation yet, which is how a new
 * chat begins.
 */
export const load = (async ({ params, fetch }) => {
	const stored = await repository.loadSession(params.id, fetch);
	return { id: params.id, session: stored ?? newSession(params.id) };
}) satisfies PageLoad;

/**
 * No server rendering for this route.
 *
 * The data lives in the browser (local mode) or behind the authenticated API
 * called from the browser (server mode), so the server has nothing to render
 * with: it produced an empty conversation that hydration immediately replaced.
 * Turning it off removes that flash and lets `load` run where the data is.
 */
export const ssr = false;
