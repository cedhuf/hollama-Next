import { json } from '@sveltejs/kit';

import { requireUser } from '$lib/server/api';
import { allowUserKeys } from '$lib/server/db/config';
import { getSharedModels, listSystemServers, listUserServers } from '$lib/server/db/servers';
import { listProviderModels } from '$lib/server/models';
import { toProviderView } from '$lib/server/serverViews';

// The providers a user may use, with their available models:
//   - system servers: ALL models for an admin (they manage them), the
//     admin-curated shared subset for a regular user.
//   - personal servers: the owner's own (best-effort live fetch).
// Keys are never included.
export async function GET(event) {
	const user = await requireUser(event);

	const system = await Promise.all(
		listSystemServers().map(async (server) => ({
			...toProviderView(server),
			models: user.role === 'admin' ? await listProviderModels(server) : getSharedModels(server.id)
		}))
	);
	const personal = await Promise.all(
		listUserServers(user.id).map(async (server) => ({
			...toProviderView(server),
			models: await listProviderModels(server)
		}))
	);

	return json({ allowUserKeys: allowUserKeys(), servers: [...system, ...personal] });
}
