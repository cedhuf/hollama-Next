import { error, json } from '@sveltejs/kit';

import { MCP_LIMITS, normaliseMcpUrl } from '$lib/mcp';
import { requireUser } from '$lib/server/api';
import { allowUserMcp } from '$lib/server/db/config';
import { createMcpServer, listMcpServers, toMcpServerView } from '$lib/server/db/mcpServers';

/**
 * An account's own MCP servers. Never anybody else's, and never the token.
 *
 * Ownership is the whole access rule, as it is for bots: the tools a server
 * offers are spent inside this account's turns, under this account's policy, so
 * the server belongs to it the way a personal provider connection does.
 */
export async function GET(event) {
	const user = await requireUser(event);
	return json(listMcpServers(user.id).map(toMcpServerView));
}

export async function POST(event) {
	const user = await requireUser(event);
	const isAdmin = user.role === 'admin';
	if (!isAdmin && !allowUserMcp()) throw error(403, 'MCP servers are managed by the administrator');

	const body = await event.request.json().catch(() => null);
	const url = normaliseMcpUrl(String(body?.url ?? ''));
	if (!url) throw error(400, 'Expected an http or https address');

	const limit = MCP_LIMITS.perUser;
	if (listMcpServers(user.id).length >= limit) {
		throw error(409, `At most ${limit} MCP servers per account`);
	}

	const record = createMcpServer({
		ownerUserId: user.id,
		label: String(body?.label ?? ''),
		url,
		secret: body?.secret ?? null,
		enabled: body?.enabled ?? true
	});

	return json(toMcpServerView(record), { status: 201 });
}
