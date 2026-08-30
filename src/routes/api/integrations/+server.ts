import { error, json } from '@sveltejs/kit';

import { INTEGRATION_KINDS, type IntegrationKind } from '$lib/integrations';
import { requireUser } from '$lib/server/api';
import { allowUserIntegrations, botsPerUser } from '$lib/server/db/config';
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
	const isAdmin = user.role === 'admin';
	if (!isAdmin && !allowUserIntegrations())
		throw error(403, 'Bots are managed by the administrator');

	const body = await event.request.json().catch(() => null);

	const kind = body?.kind as IntegrationKind | undefined;
	if (!kind || !INTEGRATION_KINDS.includes(kind)) throw error(400, 'Unknown integration kind');

	// A ceiling per account, because each bot is a loop in this process and a
	// second one is how a per-bot limit gets walked around. Admins included: the
	// number is about what the machine can carry, not about who is trusted.
	const limit = botsPerUser();
	if (listIntegrations(user.id).length >= limit) {
		throw error(409, `At most ${limit} bots per account`);
	}

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
