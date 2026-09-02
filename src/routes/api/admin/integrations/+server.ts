import { json } from '@sveltejs/kit';

import { requireAdmin } from '$lib/server/api';
import { listAllIntegrations, toIntegrationView } from '$lib/server/db/integrations';
import { getUserById } from '$lib/server/db/users';

/**
 * Every bot on the instance, with who owns it. The counterpart of letting people
 * run their own: granting that with no way to see or stop what it produced is
 * clearly wrong.
 *
 * A roster and not a second editor: two questions answered, two actions.
 * Everything about how a bot behaves stays with whoever configured it.
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
