import { error } from '@sveltejs/kit';

import { requireAdmin } from '$lib/server/api';
import { setConfig } from '$lib/server/db/config';

// The admin's set of shared personas, snapshotted into app_config. This is UI
// curation, not a security boundary (see the roadmap on server-side enforcement).
export async function PUT(event) {
	await requireAdmin(event);
	const body = await event.request.json();
	if (!Array.isArray(body)) throw error(400, 'Expected an array');
	setConfig('sharedPersonas', JSON.stringify(body));
	return new Response(null, { status: 204 });
}
