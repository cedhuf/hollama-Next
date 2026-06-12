import { json } from '@sveltejs/kit';

import { requireUser } from '$lib/server/api';
import { resolveChatDefaults } from '$lib/server/chatDefaultsResolver';
import { getSettings } from '$lib/server/db/collections';

// Server mode only: the admin-shared chat defaults (default model + title
// generation) resolved for the current user.
export async function GET(event) {
	const user = await requireUser(event);
	return json(resolveChatDefaults(getSettings(user.id), user.role === 'admin'));
}
