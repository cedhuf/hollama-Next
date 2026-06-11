import { error, json } from '@sveltejs/kit';

import { requireUser } from '$lib/server/api';
import { allowUserKeys } from '$lib/server/db/config';
import { fetchModels } from '$lib/server/models';

// Test a connection (without persisting anything) before saving it. The key is
// sent in the body and used only for this request. Admins always may; users
// only when allowUserKeys is on.
export async function POST(event) {
	const user = await requireUser(event);
	if (user.role !== 'admin' && !allowUserKeys()) throw error(403, 'Forbidden');

	const body = await event.request.json();
	if (!body?.connectionType || !body?.baseUrl) {
		throw error(400, 'connectionType and baseUrl are required');
	}

	try {
		const models = await fetchModels({
			connectionType: body.connectionType,
			baseUrl: body.baseUrl,
			apiKey: body.apiKey ?? null,
			modelFilter: body.modelFilter ?? null
		});
		return json({ ok: true, models });
	} catch (e) {
		return json({ ok: false, error: e instanceof Error ? e.message : 'Connection failed' });
	}
}
