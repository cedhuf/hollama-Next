import { json } from '@sveltejs/kit';

import { requireUser } from '$lib/server/api';
import { getSettings } from '$lib/server/db/collections';
import { resolveSearch } from '$lib/server/searchResolver';

// Server mode only: the resolved web-search config for the current user, so the
// GUI knows whether it's editable and where it comes from. The token is never
// returned — only whether one is set.
export async function GET(event) {
	const user = await requireUser(event);
	const { token, ...view } = resolveSearch(getSettings(user.id), user.role === 'admin');
	return json({ ...view, hasToken: !!token });
}
