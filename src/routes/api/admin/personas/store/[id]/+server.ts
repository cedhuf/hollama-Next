import { requireAdmin } from '$lib/server/api';
import { relayCatalogPersona, stopRelayingCatalogPersona } from '$lib/server/db/sharedPersonas';

/**
 * Relay one of the store's personas to this instance's users.
 *
 * A reference, not a copy: what is recorded is the catalogue id. Users then
 * install the store's bundle, so they get the persona itself rather than a
 * snapshot of it, and a later revision reaches them the same way it reaches
 * everyone else.
 *
 * It also means relaying costs an admin nothing: they are not installing it,
 * their library does not gain a persona they never wanted, and the catalogue
 * still lists it once.
 */
export async function PUT(event) {
	await requireAdmin(event);
	relayCatalogPersona(event.params.id);
	return new Response(null, { status: 204 });
}

export async function DELETE(event) {
	await requireAdmin(event);
	stopRelayingCatalogPersona(event.params.id);
	return new Response(null, { status: 204 });
}
