import { json } from '@sveltejs/kit';

import { requireUser } from '$lib/server/api';
import { personaStoreMode } from '$lib/server/db/config';
import { sharedCatalogPlaybookIds, sharedPlaybooks } from '$lib/server/db/sharedPlaybooks';

/**
 * What this instance offers in playbooks, and what this person may do about it.
 *
 * The lists are the catalogue's own; the policy is the store's. Whether a user
 * sees the public catalogue or only what the instance relays is a decision about
 * the store as a whole, not about one shelf of it, so it is read from the same
 * place the personas read it.
 */
export async function GET(event) {
	const user = await requireUser(event);
	const isAdmin = user.role === 'admin';

	return json({
		shared: sharedPlaybooks(),
		sharedFromStore: sharedCatalogPlaybookIds(),
		// An admin always sees the whole catalogue: it is the source they choose
		// from. What the mode decides is what everyone else's store contains.
		storeMode: isAdmin ? 'open' : personaStoreMode(),
		canShare: isAdmin
	});
}
