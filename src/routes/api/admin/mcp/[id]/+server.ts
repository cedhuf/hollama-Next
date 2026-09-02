import { error, json } from '@sveltejs/kit';

import { requireAdmin } from '$lib/server/api';
import {
	deleteMcpServer,
	getMcpServer,
	setMcpServerBlocked,
	toMcpServerView
} from '$lib/server/db/mcpServers';

/**
 * Suspend somebody else's MCP server, lift the suspension, or remove it. Only
 * those: an administrator who could rewrite the address or token of a server
 * they do not own would be redirecting somebody else's tools at a machine of
 * their choosing.
 *
 * And a suspension, not the owner's switch, which they would undo by turning it
 * back on without ever being told somebody had asked them not to.
 */
export async function PUT(event) {
	await requireAdmin(event);
	const record = getMcpServer(event.params.id);
	if (!record) throw error(404, 'No such MCP server');

	const body = await event.request.json().catch(() => null);
	if (typeof body?.blocked !== 'boolean') throw error(400, 'Expected blocked');

	setMcpServerBlocked(record.id, body.blocked);
	return json(toMcpServerView(getMcpServer(record.id)!));
}

export async function DELETE(event) {
	await requireAdmin(event);
	if (!getMcpServer(event.params.id)) throw error(404, 'No such MCP server');

	deleteMcpServer(event.params.id);
	return new Response(null, { status: 204 });
}
