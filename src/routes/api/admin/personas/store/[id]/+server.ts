import { requireAdmin } from '$lib/server/api';
import { relayCatalogPersona, stopRelayingCatalogPersona } from '$lib/server/db/sharedPersonas';

/**
 * Relay one of the store's personas to this instance's users.
 *
 * A reference, not a copy: what is recorded is the catalogue id, so users
 * install the store's bundle and a later revision reaches them like everyone
 * else. It also costs an admin nothing: their library gains no persona.
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
