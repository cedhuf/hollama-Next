import { error, json } from '@sveltejs/kit';

import { requireAdmin } from '$lib/server/api';
import {
	deleteIntegration,
	getIntegration,
	toIntegrationView,
	updateIntegration
} from '$lib/server/db/integrations';
import { reconcile } from '$lib/server/integrations/supervisor';

/**
 * Switch somebody else's bot off, or remove it.
 *
 * Only those two. An administrator who could rewrite the model or the
 * instructions of a bot they do not own would be answering in somebody else's
 * name, on somebody else's chat server.
 */
export async function PUT(event) {
	await requireAdmin(event);
	const record = getIntegration(event.params.id);
	if (!record) throw error(404, 'No such integration');

	const body = await event.request.json().catch(() => null);
	if (typeof body?.enabled !== 'boolean') throw error(400, 'Expected enabled');

	updateIntegration(record.id, { enabled: body.enabled });
	reconcile();
	return json(toIntegrationView(getIntegration(record.id)!));
}

export async function DELETE(event) {
	await requireAdmin(event);
	if (!getIntegration(event.params.id)) throw error(404, 'No such integration');

	deleteIntegration(event.params.id);
	reconcile();
	return new Response(null, { status: 204 });
}
