import { requireAdmin } from '$lib/server/api';
import { removeSharedPersona } from '$lib/server/db/sharedPersonas';

/**
 * Stop sharing one persona.
 *
 * For the ones that came from the store, which have no `shared` flag anywhere to
 * untick: they are not in the admin's library, so the republication path has
 * nothing to say about them. Copies people have already installed are theirs and
 * stay where they are.
 */
export async function DELETE(event) {
	await requireAdmin(event);
	removeSharedPersona(event.params.id);
	return new Response(null, { status: 204 });
}
