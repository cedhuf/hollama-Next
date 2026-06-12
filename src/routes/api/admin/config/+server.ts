import { json } from '@sveltejs/kit';

import { requireAdmin } from '$lib/server/api';
import {
	allowUserKeys,
	allowUserPersonas,
	getConfig,
	setAllowUserKeys,
	setAllowUserPersonas,
	setConfig
} from '$lib/server/db/config';

export async function GET(event) {
	await requireAdmin(event);
	return json({
		allowUserKeys: allowUserKeys(),
		allowUserPersonas: allowUserPersonas(),
		searchUrl: getConfig('searchUrl') ?? '',
		searchBackend: getConfig('searchBackend') ?? 'degoog',
		searchSharing: getConfig('searchSharing') ?? 'off',
		systemPromptsSharing: getConfig('systemPromptsSharing') ?? 'off',
		defaultModelSharing: getConfig('defaultModelSharing') ?? 'off',
		defaultModel: getConfig('defaultModel') ?? '',
		titleSharing: getConfig('titleSharing') ?? 'off'
	});
}

export async function PUT(event) {
	await requireAdmin(event);
	const body = await event.request.json();

	if (typeof body?.allowUserKeys === 'boolean') setAllowUserKeys(body.allowUserKeys);
	if (typeof body?.allowUserPersonas === 'boolean') setAllowUserPersonas(body.allowUserPersonas);
	if (typeof body?.searchUrl === 'string') setConfig('searchUrl', body.searchUrl.trim());
	if (body?.searchBackend === 'degoog' || body?.searchBackend === 'searxng') {
		setConfig('searchBackend', body.searchBackend);
	}
	if (typeof body?.searchToken === 'string') setConfig('searchToken', body.searchToken);
	if (['off', 'locked', 'overridable'].includes(body?.searchSharing)) {
		setConfig('searchSharing', body.searchSharing);
	}

	if (['off', 'locked', 'overridable'].includes(body?.systemPromptsSharing)) {
		setConfig('systemPromptsSharing', body.systemPromptsSharing);
	}
	// Snapshot the admin's current prompts when (re)sharing.
	if (body?.systemPrompts && typeof body.systemPrompts === 'object') {
		setConfig('systemPromptsGlobal', String(body.systemPrompts.global ?? ''));
		setConfig('systemPromptsPerModel', JSON.stringify(body.systemPrompts.perModel ?? {}));
	}

	if (['off', 'locked', 'overridable'].includes(body?.defaultModelSharing)) {
		setConfig('defaultModelSharing', body.defaultModelSharing);
	}
	if (['off', 'locked', 'overridable'].includes(body?.titleSharing)) {
		setConfig('titleSharing', body.titleSharing);
	}
	// Snapshot the admin's chat defaults when (re)sharing.
	if (typeof body?.defaultModel === 'string') setConfig('defaultModel', body.defaultModel);
	if (typeof body?.titleEnabled === 'boolean') {
		setConfig('titleEnabled', body.titleEnabled ? 'true' : 'false');
	}
	if (typeof body?.titleModel === 'string') setConfig('titleModel', body.titleModel);
	if (typeof body?.titleServerId === 'string') setConfig('titleServerId', body.titleServerId);

	return new Response(null, { status: 204 });
}
