import { json } from '@sveltejs/kit';

import { requireAdmin } from '$lib/server/api';
import {
	allowUserKeys,
	allowUserPersonas,
	getConfig,
	personaAutoUpdateForced,
	personaStoreMode,
	resetOnboarding,
	setAllowUserKeys,
	setAllowUserPersonas,
	setConfig,
	setPersonaAutoUpdateForced,
	setPersonaStoreMode,
	setStoreUrl,
	storeUrl,
	themeSharing
} from '$lib/server/db/config';
import {
	creditPeriod,
	instanceCreditLimit,
	setCreditPeriod,
	setInstanceCreditLimit
} from '$lib/server/db/usage';
import { WEB_FETCH_DEFAULTS } from '$lib/server/toolsResolver';

export async function GET(event) {
	await requireAdmin(event);
	return json({
		allowUserKeys: allowUserKeys(),
		creditLimit: instanceCreditLimit(),
		creditPeriod: creditPeriod(),
		allowUserPersonas: allowUserPersonas(),
		personaStoreMode: personaStoreMode(),
		personaAutoUpdateForced: personaAutoUpdateForced(),
		themeSharing: themeSharing(),
		themeMode: getConfig('themeMode') ?? 'system',
		themeStyle: getConfig('themeStyle') ?? 'classic',
		onboardingEpoch: Number(getConfig('onboardingEpoch') ?? 0),
		storeUrl: storeUrl() ?? '',
		searchUrl: getConfig('searchUrl') ?? '',
		searchBackend: getConfig('searchBackend') ?? 'degoog',
		searchSharing: getConfig('searchSharing') ?? 'off',
		systemPromptsSharing: getConfig('systemPromptsSharing') ?? 'off',
		defaultModelSharing: getConfig('defaultModelSharing') ?? 'off',
		defaultModel: getConfig('defaultModel') ?? '',
		titleSharing: getConfig('titleSharing') ?? 'off',
		compactSharing: getConfig('compactSharing') ?? 'off',
		webFetchSharing: getConfig('webFetchSharing') ?? 'off',
		webFetchEnabled: getConfig('webFetchEnabled') !== 'false',
		webFetchMaxPages: Number(getConfig('webFetchMaxPages') ?? WEB_FETCH_DEFAULTS.maxPages),
		webFetchMaxChars: Number(getConfig('webFetchMaxChars') ?? WEB_FETCH_DEFAULTS.maxChars)
	});
}

export async function PUT(event) {
	await requireAdmin(event);
	const body = await event.request.json();

	if (typeof body?.allowUserKeys === 'boolean') setAllowUserKeys(body.allowUserKeys);

	// The allowance everybody gets unless their own account says otherwise. Zero
	// is no limit, and is what an instance nobody has configured has.
	if (typeof body?.creditLimit === 'number') setInstanceCreditLimit(body.creditLimit);
	if (body?.creditPeriod === 'month' || body?.creditPeriod === 'week') {
		setCreditPeriod(body.creditPeriod);
	}
	if (typeof body?.allowUserPersonas === 'boolean') setAllowUserPersonas(body.allowUserPersonas);
	if (body?.personaStoreMode === 'open' || body?.personaStoreMode === 'curated') {
		setPersonaStoreMode(body.personaStoreMode);
	}

	// The admin shares their own look, exactly as they share their search engine
	// and their prompts: the panel decides who gets it, the values come from the
	// account that is sharing.
	if (['off', 'locked', 'overridable'].includes(body?.themeSharing)) {
		setConfig('themeSharing', body.themeSharing);
	}
	if (typeof body?.themeMode === 'string') setConfig('themeMode', body.themeMode);
	if (typeof body?.themeStyle === 'string') setConfig('themeStyle', body.themeStyle);

	// A stamp, so every browser can tell on its next load whether it has already
	// acknowledged this one. Nothing here has to know who has seen what.
	if (body?.resetOnboarding === true) resetOnboarding();
	if (typeof body?.personaAutoUpdateForced === 'boolean') {
		setPersonaAutoUpdateForced(body.personaAutoUpdateForced);
	}
	if (typeof body?.storeUrl === 'string') setStoreUrl(body.storeUrl);
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
	if (['off', 'locked', 'overridable'].includes(body?.compactSharing)) {
		setConfig('compactSharing', body.compactSharing);
	}

	// Web fetch: the admin shares their own configuration, exactly as they share
	// their search engine — Admin only decides who else gets it.
	if (['off', 'locked', 'overridable'].includes(body?.webFetchSharing)) {
		setConfig('webFetchSharing', body.webFetchSharing);
	}
	if (typeof body?.webFetchEnabled === 'boolean') {
		setConfig('webFetchEnabled', body.webFetchEnabled ? 'true' : 'false');
	}
	if (Number.isFinite(body?.webFetchMaxPages)) {
		setConfig('webFetchMaxPages', String(body.webFetchMaxPages));
	}
	if (Number.isFinite(body?.webFetchMaxChars)) {
		setConfig('webFetchMaxChars', String(body.webFetchMaxChars));
	}
	// Snapshot the admin's chat defaults when (re)sharing.
	if (typeof body?.defaultModel === 'string') setConfig('defaultModel', body.defaultModel);
	if (typeof body?.titleEnabled === 'boolean') {
		setConfig('titleEnabled', body.titleEnabled ? 'true' : 'false');
	}
	if (typeof body?.titleModel === 'string') setConfig('titleModel', body.titleModel);
	if (typeof body?.titleRegenerate === 'boolean') {
		setConfig('titleRegenerate', body.titleRegenerate ? 'true' : 'false');
	}
	if (Number.isFinite(body?.titleRegenerateAfter)) {
		setConfig('titleRegenerateAfter', String(body.titleRegenerateAfter));
	}
	if (typeof body?.titleServerId === 'string') setConfig('titleServerId', body.titleServerId);

	// Compaction: the admin shares the model that writes the summaries, plus the
	// automatic trigger and its ceiling — the ceiling matters most for providers
	// that never announce their context window, where it is the only limit there is.
	if (typeof body?.compactModel === 'string') setConfig('compactModel', body.compactModel);
	if (typeof body?.compactServerId === 'string') {
		setConfig('compactServerId', body.compactServerId);
	}
	if (typeof body?.compactAuto === 'boolean') {
		setConfig('compactAuto', body.compactAuto ? 'true' : 'false');
	}
	if (Number.isFinite(body?.compactThreshold)) {
		setConfig('compactThreshold', String(body.compactThreshold));
	}

	return new Response(null, { status: 204 });
}
