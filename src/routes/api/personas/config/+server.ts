import { json } from '@sveltejs/kit';

import { env as privateEnv } from '$env/dynamic/private';
import { DEFAULT_PERSONA_STORE } from '$lib/personaStore';
import { requireUser } from '$lib/server/api';
import { allowUserPersonas, personaStoreMode, personaStoreUrl } from '$lib/server/db/config';
import { sharedCatalogIds, sharedPersonas } from '$lib/server/db/sharedPersonas';

export async function GET(event) {
	const user = await requireUser(event);

	const isAdmin = user.role === 'admin';

	// The store's address is shown to everyone and editable by an admin: it is the
	// instance's, and a user who cannot change it should still be able to see where
	// their personas are coming from.
	const relayed = sharedCatalogIds();

	return json({
		shared: sharedPersonas(),
		sharedFromStore: relayed,
		canCreate: isAdmin || allowUserPersonas(),
		// An admin always sees the whole catalogue: it is the source they choose
		// from. What the mode decides is what everyone else's store contains.
		storeMode: isAdmin ? 'open' : personaStoreMode(),
		canShare: isAdmin,
		storeUrl: personaStoreUrl() ?? privateEnv.PERSONA_STORE_URL ?? DEFAULT_PERSONA_STORE,
		canEditStore: isAdmin
	});
}
