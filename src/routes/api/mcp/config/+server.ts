import { json } from '@sveltejs/kit';

import { MCP_LIMITS } from '$lib/mcp';
import { requireUser } from '$lib/server/api';
import { allowUserMcp } from '$lib/server/db/config';
import { hasMcpServers } from '$lib/server/mcp/session';

/** Its own endpoint, like the bots one, read at boot as well as by the Tools tab: the composer's menu decides from `hasServers` whether to offer an MCP switch, and one that appears a moment late is pressed twice. */
export async function GET(event) {
	const user = await requireUser(event);
	return json({
		canManage: user.role === 'admin' || allowUserMcp(),
		isAdmin: user.role === 'admin',
		limit: MCP_LIMITS.perUser,
		// Whether there is anything to switch on, which differs from whether this
		// account may add one. A toggle for a feature nobody here has configured is a
		// row that only ever says no.
		hasServers: hasMcpServers(user.id, user.role === 'admin')
	});
}
