import { error, json } from '@sveltejs/kit';

import { requireUser } from '$lib/server/api';
import { getMcpServer, toMcpServerView } from '$lib/server/db/mcpServers';
import { McpError } from '$lib/server/mcp/client';
import { refreshMcpTools } from '$lib/server/mcp/session';

/** A gateway gains and loses tools without telling anybody, so the stored catalogue is a snapshot and this is how it is retaken. Explicit: refreshing on sight would open a connection every time a tab is opened. */
export async function POST(event) {
	const user = await requireUser(event);

	const record = getMcpServer(event.params.id);
	if (!record || record.ownerUserId !== user.id) throw error(404, 'No such MCP server');

	try {
		await refreshMcpTools(record);
	} catch (cause) {
		// Not an error status: the server exists, it is its answer that failed, and the
		// card says so beside the button rather than as a toast about the request.
		return json({
			ok: false,
			error: cause instanceof McpError ? cause.message : 'The server could not be reached'
		});
	}

	return json({ ok: true, server: toMcpServerView(getMcpServer(record.id)!) });
}
