import { error, json } from '@sveltejs/kit';

import { requireAdmin } from '$lib/server/api';
import {
	deleteMcpServer,
	getMcpServer,
	setMcpServerBlocked,
	toMcpServerView
} from '$lib/server/db/mcpServers';

/**
 * Suspend somebody else's MCP server, or lift the suspension. Or remove it.
 *
 * Only those. An administrator who could rewrite the address or the token of a
 * server they do not own would be redirecting somebody else's tools at a machine
 * of their choosing, which is a worse power than switching it off.
 *
 * And a suspension, not the owner's switch: turning that off would be a decision
 * the owner undoes by turning it back on, without ever being told that somebody
 * had asked them not to.
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
