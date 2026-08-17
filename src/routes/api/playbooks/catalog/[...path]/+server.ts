import { env as privateEnv } from '$env/dynamic/private';
import { DEFAULT_PLAYBOOK_STORE } from '$lib/playbookStore';
import { requireUser } from '$lib/server/api';
import { playbookStoreUrl } from '$lib/server/db/config';
import { serveFromStore } from '$lib/server/storeProxy';

/** The playbook store, read by the instance. The persona route's twin. */
function store(): string {
	const url = playbookStoreUrl() || privateEnv.PLAYBOOK_STORE_URL || DEFAULT_PLAYBOOK_STORE;
	return url.replace(/\/*$/, '/');
}

export async function GET(event) {
	await requireUser(event);

	return serveFromStore({
		base: store(),
		path: event.params.path,
		fresh: event.url.searchParams.get('fresh') === '1',
		label: 'playbook store'
	});
}
