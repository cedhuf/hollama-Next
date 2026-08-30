import { json } from '@sveltejs/kit';

import { requireAdmin } from '$lib/server/api';
import { listAllIntegrations, toIntegrationView } from '$lib/server/db/integrations';
import { getUserById } from '$lib/server/db/users';

/**
 * Every bot on the instance, with who owns it.
 *
 * The counterpart of letting people run their own: granting that without any
 * way to see or stop what it produced is the one arrangement that is clearly
 * wrong. Deliberately a roster and not a second editor. An administrator here
 * answers two questions, what is running and on whose account, and has two
 * actions, switch it off and remove it. Everything about how a bot behaves
 * stays with the person who configured it.
 */
export async function GET(event) {
	await requireAdmin(event);

	return json(
		listAllIntegrations().map((record) => {
			const owner = getUserById(record.ownerUserId);
			return {
				...toIntegrationView(record),
				owner: owner?.email ?? record.ownerUserId
			};
		})
	);
}
