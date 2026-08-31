import { json } from '@sveltejs/kit';

import { requireAdmin } from '$lib/server/api';
import { listAllMcpServers, toMcpServerView } from '$lib/server/db/mcpServers';
import { getUserById } from '$lib/server/db/users';

/**
 * Every MCP server on the instance, with whose it is.
 *
 * The owner's name rather than only their id, because the decision an
 * administrator takes here is about a person's server, and a row that says
 * nothing about whose it is invites suspending the wrong one.
 */
export async function GET(event) {
	await requireAdmin(event);

	return json(
		listAllMcpServers().map((record) => ({
			...toMcpServerView(record),
			owner: getUserById(record.ownerUserId)?.email ?? record.ownerUserId
		}))
	);
}
