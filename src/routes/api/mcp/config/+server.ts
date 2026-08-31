import { json } from '@sveltejs/kit';

import { MCP_LIMITS } from '$lib/mcp';
import { requireUser } from '$lib/server/api';
import { allowUserMcp } from '$lib/server/db/config';

/**
 * What this account is allowed to do with MCP servers.
 *
 * Its own endpoint, like the bots one, and read when the Tools tab opens rather
 * than at boot: the section lives inside a tab that is already there, so nothing
 * about the window's shape depends on the answer.
 */
export async function GET(event) {
	const user = await requireUser(event);
	return json({
		canManage: user.role === 'admin' || allowUserMcp(),
		isAdmin: user.role === 'admin',
		limit: MCP_LIMITS.perUser
	});
}
