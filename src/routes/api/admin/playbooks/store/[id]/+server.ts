import { requireAdmin } from '$lib/server/api';
import { relayCatalogPlaybook, stopRelayingCatalogPlaybook } from '$lib/server/db/sharedPlaybooks';

/**
 * Relaying one of the store's playbooks, or stopping.
 *
 * A reference, not a copy: nothing is installed here and nothing is frozen, so
 * the store's next revision still reaches whoever took the instance's word for
 * it. Stopping does not take back what people already installed, which is theirs.
 */
export async function PUT(event) {
	await requireAdmin(event);
	relayCatalogPlaybook(event.params.id);
	return new Response(null, { status: 204 });
}

export async function DELETE(event) {
	await requireAdmin(event);
	stopRelayingCatalogPlaybook(event.params.id);
	return new Response(null, { status: 204 });
}
