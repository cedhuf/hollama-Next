import { json } from '@sveltejs/kit';

import { requireAdmin } from '$lib/server/api';
import { allowUserKeys, getConfig, setAllowUserKeys, setConfig } from '$lib/server/db/config';

export async function GET(event) {
	await requireAdmin(event);
	return json({
		allowUserKeys: allowUserKeys(),
		searchUrl: getConfig('searchUrl') ?? '',
		searchBackend: getConfig('searchBackend') ?? 'degoog',
		searchSharing: getConfig('searchSharing') ?? 'off'
	});
}

export async function PUT(event) {
	await requireAdmin(event);
	const body = await event.request.json();

	if (typeof body?.allowUserKeys === 'boolean') setAllowUserKeys(body.allowUserKeys);
	if (typeof body?.searchUrl === 'string') setConfig('searchUrl', body.searchUrl.trim());
	if (body?.searchBackend === 'degoog' || body?.searchBackend === 'searxng') {
		setConfig('searchBackend', body.searchBackend);
	}
	if (typeof body?.searchToken === 'string') setConfig('searchToken', body.searchToken);
	if (['off', 'locked', 'overridable'].includes(body?.searchSharing)) {
		setConfig('searchSharing', body.searchSharing);
	}

	return new Response(null, { status: 204 });
}
