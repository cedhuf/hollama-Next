import { json } from '@sveltejs/kit';

import { requireUser } from '$lib/server/api';
import { allowUserKeys } from '$lib/server/db/config';
import { listSystemServers, listUserServers } from '$lib/server/db/servers';
import { toProviderView } from '$lib/server/serverViews';

// The providers a user may use: admin-shared system servers plus their own
// personal servers. Keys are never included.
export async function GET(event) {
	const user = await requireUser(event);
	const servers = [...listSystemServers(), ...listUserServers(user.id)].map(toProviderView);
	return json({ allowUserKeys: allowUserKeys(), servers });
}
