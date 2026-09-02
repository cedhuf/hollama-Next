import { error, json } from '@sveltejs/kit';

import { INTEGRATION_KINDS, normaliseConfig, type IntegrationKind } from '$lib/integrations';
import { requireUser } from '$lib/server/api';
import { getIntegration, getIntegrationSecret } from '$lib/server/db/integrations';
import { providerFor } from '$lib/server/integrations/registry';

/** Asked before anything is saved, the order the connections tab uses: nobody should have to store a credential to find out it is the wrong one. An `id` may be sent instead, to re-test what is stored. */
export async function POST(event) {
	const user = await requireUser(event);
	const body = await event.request.json().catch(() => null);

	const kind = body?.kind as IntegrationKind | undefined;
	if (!kind || !INTEGRATION_KINDS.includes(kind)) throw error(400, 'Unknown integration kind');

	let secret: string | null = body.secret ?? null;
	if (!secret && body.id) {
		const stored = getIntegration(body.id);
		if (!stored || stored.ownerUserId !== user.id) throw error(404, 'No such integration');
		secret = getIntegrationSecret(stored.id);
	}
	if (!secret) return json({ ok: false, error: 'No API key given' });

	const config = normaliseConfig(kind, body.config);
	if (!config.baseUrl) return json({ ok: false, error: 'No server address given' });

	// A record that exists only for the length of this call. The provider is handed
	// its credential rather than looking one up, so a draft tests exactly as a
	// stored integration does.
	const draft = {
		id: body.id ?? 'draft',
		ownerUserId: user.id,
		kind,
		label: '',
		config,
		hasSecret: true,
		enabled: false,
		blocked: false,
		createdAt: new Date().toISOString()
	};

	return json(await providerFor(kind).test(draft, secret));
}
