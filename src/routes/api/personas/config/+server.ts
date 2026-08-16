import { json } from '@sveltejs/kit';

import { env as privateEnv } from '$env/dynamic/private';
import type { Persona } from '$lib/personas';
import { DEFAULT_PERSONA_STORE } from '$lib/personaStore';
import { requireUser } from '$lib/server/api';
import { allowUserPersonas, getConfig, personaStoreUrl } from '$lib/server/db/config';

export async function GET(event) {
	const user = await requireUser(event);

	let shared: Persona[] = [];
	try {
		const raw = getConfig('sharedPersonas');
		if (raw) shared = JSON.parse(raw) as Persona[];
	} catch {
		shared = [];
	}

	// The store's address is shown to everyone and editable by an admin: it is the
	// instance's, and a user who cannot change it should still be able to see where
	// their personas are coming from.
	return json({
		shared,
		canCreate: user.role === 'admin' || allowUserPersonas(),
		storeUrl: personaStoreUrl() ?? privateEnv.PERSONA_STORE_URL ?? DEFAULT_PERSONA_STORE,
		canEditStore: user.role === 'admin'
	});
}
