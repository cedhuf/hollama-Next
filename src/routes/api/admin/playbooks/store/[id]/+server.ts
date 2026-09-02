import { requireAdmin } from '$lib/server/api';
import { relayCatalogPlaybook, stopRelayingCatalogPlaybook } from '$lib/server/db/sharedPlaybooks';

/** A reference, not a copy: nothing is installed and nothing frozen, so the store's next revision still reaches whoever took the instance's word. Stopping does not take back what people installed. */
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
