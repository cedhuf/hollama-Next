import { json } from '@sveltejs/kit';

import { requireUser } from '$lib/server/api';
import { allowUserKeys } from '$lib/server/db/config';
import { listSystemServers, listUserServers } from '$lib/server/db/servers';
import { listProviderModels } from '$lib/server/models';
import { toProviderView } from '$lib/server/serverViews';

// The providers a user may use: admin-shared system servers plus their own
// personal servers. Keys are never included. Each carries its available models
// (system: admin-curated shared list; personal: a best-effort live fetch).
export async function GET(event) {
	const user = await requireUser(event);

	const system = listSystemServers().map(toProviderView); // already includes shared models
	const personal = await Promise.all(
		listUserServers(user.id).map(async (server) => ({
			...toProviderView(server),
			models: await listProviderModels(server)
		}))
	);

	return json({ allowUserKeys: allowUserKeys(), servers: [...system, ...personal] });
}
