import { json } from '@sveltejs/kit';

import { requireUser } from '$lib/server/api';
import { allowUserKeys } from '$lib/server/db/config';
import { getSharedModels, listSystemServers, listUserServers } from '$lib/server/db/servers';
import { listProviderModels } from '$lib/server/models';
import { pickModelKinds, pickModelLabels, toProviderView } from '$lib/server/serverViews';

// The providers a user may use, with their available models:
//   - system servers: ALL models for an admin (they manage them), the
//     admin-curated shared subset for a regular user.
//   - personal servers: the owner's own (best-effort live fetch).
// Keys are never included.
export async function GET(event) {
	const user = await requireUser(event);

	// Only enabled servers are usable (the proxy refuses disabled ones).
	const system = await Promise.all(
		listSystemServers()
			.filter((server) => server.is_enabled)
			.map(async (server) => {
				const listed = user.role === 'admin' ? await listProviderModels(server) : null;
				const models = listed ? listed.names : getSharedModels(server.id);
				// Display names and kinds ride along with the catalogue, so every model
				// dropdown can render and filter without a second round-trip.
				//
				// Two sources for the kinds, in order of authority: what the provider
				// declared when asked a narrow question, then what somebody stored
				// against this connection. A person's correction is always the last
				// word, over a provider as much as over a guessed name.
				return {
					...toProviderView(server),
					models,
					modelLabels: pickModelLabels(server.id, models),
					modelKinds: { ...(listed?.kinds ?? {}), ...pickModelKinds(server.id, models) }
				};
			})
	);
	const personal = await Promise.all(
		listUserServers(user.id)
			.filter((server) => server.is_enabled)
			.map(async (server) => {
				const { names: models, kinds } = await listProviderModels(server);
				return {
					...toProviderView(server),
					models,
					modelLabels: pickModelLabels(server.id, models),
					modelKinds: { ...kinds, ...pickModelKinds(server.id, models) }
				};
			})
	);

	return json({ allowUserKeys: allowUserKeys(), servers: [...system, ...personal] });
}
