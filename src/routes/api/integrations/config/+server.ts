import { json } from '@sveltejs/kit';

import { requireUser } from '$lib/server/api';
import { allowUserIntegrations, botsPerUser } from '$lib/server/db/config';

/**
 * What this account is allowed to do with bots, asked before anything is shown.
 *
 * Its own endpoint, tiny, and read at boot like the other governance answers:
 * the settings window decides whether to offer the tab at all, and a tab that
 * appears and then apologises is worse than one that was never there.
 */
export async function GET(event) {
	const user = await requireUser(event);
	return json({
		canManage: user.role === 'admin' || allowUserIntegrations(),
		isAdmin: user.role === 'admin',
		limit: botsPerUser()
	});
}
