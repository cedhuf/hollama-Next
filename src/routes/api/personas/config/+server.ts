import { json } from '@sveltejs/kit';

import { env as privateEnv } from '$env/dynamic/private';
import { DEFAULT_PERSONA_STORE } from '$lib/personaStore';
import { requireUser } from '$lib/server/api';
import { allowUserPersonas, allowUserStoreInstall, personaStoreUrl } from '$lib/server/db/config';
import { sharedPersonas } from '$lib/server/db/sharedPersonas';

export async function GET(event) {
	const user = await requireUser(event);

	const isAdmin = user.role === 'admin';

	// The store's address is shown to everyone and editable by an admin: it is the
	// instance's, and a user who cannot change it should still be able to see where
	// their personas are coming from.
	return json({
		shared: sharedPersonas(),
		canCreate: isAdmin || allowUserPersonas(),
		// An admin installs for themselves like anyone else; the switch is about the
		// people they administer.
		canInstall: isAdmin || allowUserStoreInstall(),
		canShare: isAdmin,
		storeUrl: personaStoreUrl() ?? privateEnv.PERSONA_STORE_URL ?? DEFAULT_PERSONA_STORE,
		canEditStore: isAdmin
	});
}
