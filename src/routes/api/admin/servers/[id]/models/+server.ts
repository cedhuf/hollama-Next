import { error, json } from '@sveltejs/kit';

import { requireAdmin } from '$lib/server/api';
import { getServer } from '$lib/server/db/servers';
import { listProviderModels } from '$lib/server/models';

// Live list of the models a system server actually offers (fetched server-side
// with its key), so the admin can pick which ones to share.
export async function GET(event) {
	await requireAdmin(event);
	const server = getServer(event.params.id);
	if (!server || server.owner_user_id !== null) throw error(404, 'System server not found');
	return json(await listProviderModels(server));
}
