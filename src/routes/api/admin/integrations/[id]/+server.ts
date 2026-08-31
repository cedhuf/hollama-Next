import { error, json } from '@sveltejs/kit';

import { requireAdmin } from '$lib/server/api';
import {
	deleteIntegration,
	getIntegration,
	setIntegrationBlocked,
	toIntegrationView
} from '$lib/server/db/integrations';
import { reconcile } from '$lib/server/integrations/supervisor';

/**
 * Suspend somebody else's bot, or lift the suspension. Or remove it.
 *
 * Only those. An administrator who could rewrite the model or the instructions
 * of a bot they do not own would be answering in somebody else's name, on
 * somebody else's chat server.
 *
 * And a suspension, not their switch: turning the owner's own switch off would
 * be a decision the owner undoes by turning it back on, without ever being told
 * that somebody had asked them not to.
 */
export async function PUT(event) {
	await requireAdmin(event);
	const record = getIntegration(event.params.id);
	if (!record) throw error(404, 'No such integration');

	const body = await event.request.json().catch(() => null);
	if (typeof body?.blocked !== 'boolean') throw error(400, 'Expected blocked');

	setIntegrationBlocked(record.id, body.blocked);
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
