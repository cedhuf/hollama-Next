import { error, json } from '@sveltejs/kit';

import { MCP_LIMITS, normaliseMcpUrl } from '$lib/mcp';
import { requireUser } from '$lib/server/api';
import { allowUserMcp } from '$lib/server/db/config';
import {
	createMcpServer,
	getMcpServer,
	listMcpServers,
	toMcpServerView
} from '$lib/server/db/mcpServers';
import { refreshMcpTools } from '$lib/server/mcp/session';

/** Ownership is the whole access rule, as it is for bots: the tools a server offers are spent inside this account's turns, under its policy. */
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

	// Asked once here, so the card arrives with its catalogue rather than an empty
	// list and a button. A server that cannot be reached is still created: the
	// address may be right and the machine down, and failing would lose the token.
	await refreshMcpTools(record).catch(() => {});

	return json(toMcpServerView(getMcpServer(record.id) ?? record), { status: 201 });
}
