import { env as privateEnv } from '$env/dynamic/private';
import { DEFAULT_PERSONA_STORE } from '$lib/personaStore';
import { requireUser } from '$lib/server/api';
import { personaStoreUrl } from '$lib/server/db/config';
import { serveFromStore } from '$lib/server/storeProxy';

/**
 * The persona store, read by the instance. See `server/storeProxy` for why, and
 * for everything this route does not have to say twice.
 */

/**
 * The admin's address, then the environment's, then ours.
 *
 * The panel wins over the variable rather than the reverse: a variable is what a
 * deployment sets once, and an administrator changing it in the interface and
 * finding it ignored would have no way of telling why.
 */
function store(): string {
	const url = personaStoreUrl() || privateEnv.PERSONA_STORE_URL || DEFAULT_PERSONA_STORE;
	return url.replace(/\/*$/, '/');
}

export async function GET(event) {
	await requireUser(event);

	return serveFromStore({
		base: store(),
		path: event.params.path,
		// The refresh control in the interface says so here, and the held copy is
		// skipped. Without it, pressing Refresh did nothing for up to fifteen
		// minutes and there was no way to tell that from the store not having
		// changed.
		fresh: event.url.searchParams.get('fresh') === '1',
		label: 'persona store'
	});
}
