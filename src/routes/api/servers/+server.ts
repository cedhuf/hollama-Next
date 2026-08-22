import { error, json } from '@sveltejs/kit';

import { requireUser } from '$lib/server/api';
import { allowUserKeys } from '$lib/server/db/config';
import { createServer } from '$lib/server/db/servers';
import { toProviderView } from '$lib/server/serverViews';

// Personal servers — only when the admin has enabled allowUserKeys.
export async function POST(event) {
	const user = await requireUser(event);
	if (!allowUserKeys()) throw error(403, 'User-provided keys are disabled');

	const body = await event.request.json();
	if (!body?.connectionType || !body?.baseUrl) {
		throw error(400, 'connectionType and baseUrl are required');
	}

	const server = createServer({
		ownerUserId: user.id,
		connectionType: body.connectionType,
		baseUrl: body.baseUrl,
		imageBaseUrl: body.imageBaseUrl ?? null,
		apiKey: body.apiKey ?? null,
		label: body.label ?? null,
		modelFilter: body.modelFilter ?? null,
		isEnabled: body.isEnabled ?? true,
		color: body.color ?? null
	});
	return json(toProviderView(server), { status: 201 });
}
