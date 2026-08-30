import { error, json } from '@sveltejs/kit';

import { INTEGRATION_KINDS, type IntegrationKind } from '$lib/integrations';
import { requireUser } from '$lib/server/api';
import {
	createIntegration,
	listIntegrations,
	toIntegrationView
} from '$lib/server/db/integrations';
import { reconcile } from '$lib/server/integrations/supervisor';

/**
 * An account's own integrations. Never anybody else's, and never the key.
 *
 * Ownership is the whole access rule here: an integration answers with the
 * owner's connections, under the owner's policy, so it belongs to them the way
 * a personal provider connection does.
 */
export async function GET(event) {
	const user = await requireUser(event);
	return json(listIntegrations(user.id).map(toIntegrationView));
}

export async function POST(event) {
	const user = await requireUser(event);
	const body = await event.request.json().catch(() => null);

	const kind = body?.kind as IntegrationKind | undefined;
	if (!kind || !INTEGRATION_KINDS.includes(kind)) throw error(400, 'Unknown integration kind');

	const record = createIntegration({
		ownerUserId: user.id,
		kind,
		label: body.label ?? null,
		config: body.config,
		secret: body.secret ?? null,
		enabled: body.enabled ?? true
	});

	// Nothing watches the table, so every write says so.
	reconcile();
	return json(toIntegrationView(record), { status: 201 });
}
