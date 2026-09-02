import { error, json } from '@sveltejs/kit';

import { normaliseMcpUrl } from '$lib/mcp';
import { requireUser } from '$lib/server/api';
import { getMcpServer, getMcpServerSecret } from '$lib/server/db/mcpServers';
import { connectMcp, listMcpTools, McpError } from '$lib/server/mcp/client';

/**
 * Does this reach a server, and what does it offer.
 *
 * Asked before anything is saved, like the connections and bots tabs: nobody
 * should have to store a token to find out it is the wrong one. An `id` may be
 * sent instead, to re-test what is stored.
 *
 * The tool names come back because they are the answer people actually want:
 * "connected" says the address is right, the list says it is the server they
 * meant.
 */
export async function POST(event) {
	const user = await requireUser(event);
	const body = await event.request.json().catch(() => null);

	let url = normaliseMcpUrl(String(body?.url ?? ''));
	let secret: string | null = typeof body?.secret === 'string' ? body.secret : null;

	if (body?.id) {
		const stored = getMcpServer(String(body.id));
		if (!stored || stored.ownerUserId !== user.id) throw error(404, 'No such MCP server');
		url = url ?? stored.url;
		if (secret === null) secret = getMcpServerSecret(stored.id);
	}

	if (!url) return json({ ok: false, error: 'Expected an http or https address' });

	let client: Awaited<ReturnType<typeof connectMcp>> | null = null;
	try {
		client = await connectMcp(url, secret || null);
		const tools = await listMcpTools(client);
		// The whole catalogue, uncut. What a turn actually sends depends on every other
		// server switched on and on this account's ceiling, which the settings answer
		// beside the field that holds the number.
		return json({ ok: true, tools: tools.map((tool) => tool.name), total: tools.length });
	} catch (cause) {
		return json({ ok: false, error: message(cause) });
	} finally {
		await client?.close().catch(() => {});
	}
}

function message(cause: unknown): string {
	if (cause instanceof McpError) return cause.message;
	if (cause instanceof Error) return cause.message;
	return 'The server could not be reached';
}
