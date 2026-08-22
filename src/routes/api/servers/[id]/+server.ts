import { error, json } from '@sveltejs/kit';

import { requireUser } from '$lib/server/api';
import {
	deleteServer,
	getServer,
	setModelKinds,
	setModelLabels,
	updateServer
} from '$lib/server/db/servers';
import { toProviderView } from '$lib/server/serverViews';

// A user may only touch their own personal servers.
function requireOwnServer(id: string, userId: string) {
	const server = getServer(id);
	if (!server || server.owner_user_id !== userId) throw error(404, 'Server not found');
	return server;
}

export async function PUT(event) {
	const user = await requireUser(event);
	requireOwnServer(event.params.id, user.id);
	const body = await event.request.json();

	updateServer(event.params.id, {
		baseUrl: body.baseUrl,
		imageBaseUrl: body.imageBaseUrl,
		apiKey: body.apiKey,
		label: body.label,
		modelFilter: body.modelFilter,
		isEnabled: body.isEnabled,
		verifiedAt: body.verifiedAt,
		color: body.color
	});
	if (body.modelLabels && typeof body.modelLabels === 'object') {
		setModelLabels(event.params.id, body.modelLabels);
	}
	if (body.modelKinds && typeof body.modelKinds === 'object') {
		setModelKinds(event.params.id, body.modelKinds);
	}
	return json(toProviderView(getServer(event.params.id)!));
}

export async function DELETE(event) {
	const user = await requireUser(event);
	requireOwnServer(event.params.id, user.id);
	deleteServer(event.params.id);
	return new Response(null, { status: 204 });
}
