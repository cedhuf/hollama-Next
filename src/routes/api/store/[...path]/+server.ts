import { env as privateEnv } from '$env/dynamic/private';
import { requireUser } from '$lib/server/api';
import { storeUrl } from '$lib/server/db/config';
import { serveFromStore } from '$lib/server/storeProxy';
import { DEFAULT_STORE, normalizeStoreUrl } from '$lib/store';

/**
 * The store, read by the instance rather than by each browser. One route for
 * every catalogue under it: a route per kind was a route per kind's worth of the
 * same twenty lines. See `server/storeProxy` for what it does.
 */

/** The panel wins over the variable rather than the reverse: a variable is what a deployment sets once, and an administrator changing it and finding it ignored would have no way of telling why. */
function base(): string {
	return normalizeStoreUrl(storeUrl() || privateEnv.STORE_URL || DEFAULT_STORE);
}

export async function GET(event) {
	await requireUser(event);

	return serveFromStore({
		base: base(),
		path: event.params.path,
		// The refresh control says so here, and the held copy is skipped. Without it,
		// pressing Refresh did nothing for up to fifteen minutes.
		fresh: event.url.searchParams.get('fresh') === '1',
		label: 'store'
	});
}
