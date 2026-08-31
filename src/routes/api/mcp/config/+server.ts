import { json } from '@sveltejs/kit';

import { MCP_LIMITS } from '$lib/mcp';
import { requireUser } from '$lib/server/api';
import { allowUserMcp } from '$lib/server/db/config';
import { hasMcpServers } from '$lib/server/mcp/session';

/**
 * What this account is allowed to do with MCP servers.
 *
 * Its own endpoint, like the bots one. Read at boot as well as by the Tools tab:
 * the composer's tool menu decides whether to offer an MCP switch at all from
 * `hasServers`, and a switch that appears a moment after the page has appeared
 * is a switch people press twice.
 */
export async function GET(event) {
	const user = await requireUser(event);
	return json({
		canManage: user.role === 'admin' || allowUserMcp(),
		isAdmin: user.role === 'admin',
		limit: MCP_LIMITS.perUser,
		// Whether there is anything to switch on, which is a different question
		// from whether this account may add one. The composer's menu hangs on this:
		// a toggle for a feature nobody here has configured is a row that only ever
		// says no.
		hasServers: hasMcpServers(user.id, user.role === 'admin')
	});
}
