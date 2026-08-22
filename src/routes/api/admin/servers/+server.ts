import { error, json } from '@sveltejs/kit';

import { requireAdmin } from '$lib/server/api';
import { createServer, listSystemServers, setSharedModels } from '$lib/server/db/servers';
import { toAdminView } from '$lib/server/serverViews';

export async function GET(event) {
	await requireAdmin(event);
	return json(listSystemServers().map(toAdminView));
}

export async function POST(event) {
	await requireAdmin(event);
	const body = await event.request.json();
	if (!body?.connectionType || !body?.baseUrl) {
		throw error(400, 'connectionType and baseUrl are required');
	}

	const server = createServer({
		ownerUserId: null,
		connectionType: body.connectionType,
		baseUrl: body.baseUrl,
		imageBaseUrl: body.imageBaseUrl ?? null,
		apiKey: body.apiKey ?? null,
		label: body.label ?? null,
		modelFilter: body.modelFilter ?? null,
		isEnabled: body.isEnabled ?? true,
		color: body.color ?? null
	});
	if (Array.isArray(body.sharedModels)) setSharedModels(server.id, body.sharedModels);

	return json(toAdminView(server), { status: 201 });
}
