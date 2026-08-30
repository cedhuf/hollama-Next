import { error, json } from '@sveltejs/kit';

import { requireUser } from '$lib/server/api';
import {
	deleteIntegration,
	getIntegration,
	toIntegrationView,
	updateIntegration
} from '$lib/server/db/integrations';
import { reconcile } from '$lib/server/integrations/supervisor';

/** The caller's own integration, or a 404. Not found and not yours read the same. */
async function own(event: Parameters<typeof requireUser>[0], id: string) {
	const user = await requireUser(event);
	const record = getIntegration(id);
	if (!record || record.ownerUserId !== user.id) throw error(404, 'No such integration');
	return record;
}

export async function GET(event) {
	const record = await own(event, event.params.id);
	return json(toIntegrationView(record));
}

export async function PUT(event) {
	await own(event, event.params.id);
	const body = await event.request.json().catch(() => null);
	if (!body) throw error(400, 'Expected a body');

	const updated = updateIntegration(event.params.id, {
		label: body.label,
		config: body.config,
		// Omitted keeps the stored key, '' clears it. The form cannot read a key
		// back, so it needs a way to say "leave it alone" that is not "no key".
		secret: body.secret,
		enabled: body.enabled
	});

	reconcile();
	return json(toIntegrationView(updated!));
}

export async function DELETE(event) {
	await own(event, event.params.id);
	deleteIntegration(event.params.id);
	reconcile();
	return new Response(null, { status: 204 });
}
