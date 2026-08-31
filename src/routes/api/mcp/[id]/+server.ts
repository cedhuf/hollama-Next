import { error, json } from '@sveltejs/kit';

import { requireUser } from '$lib/server/api';
import {
	deleteMcpServer,
	getMcpServer,
	toMcpServerView,
	updateMcpServer
} from '$lib/server/db/mcpServers';

/** The caller's own server, or a 404. Not found and not yours read the same. */
async function own(event: Parameters<typeof requireUser>[0], id: string) {
	const user = await requireUser(event);
	const record = getMcpServer(id);
	if (!record || record.ownerUserId !== user.id) throw error(404, 'No such MCP server');
	return record;
}

export async function GET(event) {
	const record = await own(event, event.params.id);
	return json(toMcpServerView(record));
}

export async function PUT(event) {
	await own(event, event.params.id);
	const body = await event.request.json().catch(() => null);
	if (!body) throw error(400, 'Expected a body');

	let updated;
	try {
		updated = updateMcpServer(event.params.id, {
			label: body.label,
			url: body.url,
			// Omitted keeps the stored token, '' clears it. The form cannot read a
			// token back, so it needs a way to say "leave it alone" that is not
			// "no token".
			secret: body.secret,
			enabled: body.enabled,
			disabledGroups: Array.isArray(body.disabledGroups) ? body.disabledGroups : undefined
		});
	} catch (cause) {
		throw error(400, cause instanceof Error ? cause.message : 'Could not be saved');
	}

	return json(toMcpServerView(updated!));
}

export async function DELETE(event) {
	await own(event, event.params.id);
	deleteMcpServer(event.params.id);
	return new Response(null, { status: 204 });
}
