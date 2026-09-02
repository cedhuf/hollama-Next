import { json } from '@sveltejs/kit';

import { requireAdmin } from '$lib/server/api';
import { listAllMcpServers, toMcpServerView } from '$lib/server/db/mcpServers';
import { getUserById } from '$lib/server/db/users';

/** The owner's name rather than only their id: the decision taken here is about a person's server, and a row that says nothing about whose invites suspending the wrong one. */
export async function GET(event) {
	await requireAdmin(event);

	return json(
		listAllMcpServers().map((record) => ({
			...toMcpServerView(record),
			owner: getUserById(record.ownerUserId)?.email ?? record.ownerUserId
		}))
	);
}
