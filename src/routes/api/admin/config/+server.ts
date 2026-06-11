import { error, json } from '@sveltejs/kit';

import { requireAdmin } from '$lib/server/api';
import { allowUserKeys, setAllowUserKeys } from '$lib/server/db/config';

export async function GET(event) {
	await requireAdmin(event);
	return json({ allowUserKeys: allowUserKeys() });
}

export async function PUT(event) {
	await requireAdmin(event);
	const body = await event.request.json();
	if (typeof body?.allowUserKeys !== 'boolean') throw error(400, 'allowUserKeys must be a boolean');
	setAllowUserKeys(body.allowUserKeys);
	return new Response(null, { status: 204 });
}
