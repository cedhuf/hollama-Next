import { error, json } from '@sveltejs/kit';

import { requireAdmin } from '$lib/server/api';
import {
	deleteServer,
	getServer,
	setModelKinds,
	setModelLabels,
	setModelPricing,
	setSharedModels,
	updateServer
} from '$lib/server/db/servers';
import { toAdminView } from '$lib/server/serverViews';

function requireSystemServer(id: string) {
	const server = getServer(id);
	if (!server || server.owner_user_id !== null) throw error(404, 'System server not found');
	return server;
}

export async function PUT(event) {
	await requireAdmin(event);
	requireSystemServer(event.params.id);
	const body = await event.request.json();

	updateServer(event.params.id, {
		baseUrl: body.baseUrl,
		apiKey: body.apiKey, // omit to keep, '' / null to clear
		label: body.label,
		modelFilter: body.modelFilter,
		isEnabled: body.isEnabled,
		verifiedAt: body.verifiedAt,
		color: body.color
	});
	if (body.modelLabels && typeof body.modelLabels === 'object') {
		setModelLabels(event.params.id, body.modelLabels);
	}
	if (body.modelPricing && typeof body.modelPricing === 'object') {
		setModelPricing(event.params.id, body.modelPricing);
	}
	if (body.modelKinds && typeof body.modelKinds === 'object') {
		setModelKinds(event.params.id, body.modelKinds);
	}
	if (Array.isArray(body.sharedModels)) setSharedModels(event.params.id, body.sharedModels);

	return json(toAdminView(getServer(event.params.id)!));
}

export async function DELETE(event) {
	await requireAdmin(event);
	requireSystemServer(event.params.id);
	deleteServer(event.params.id);
	return new Response(null, { status: 204 });
}
