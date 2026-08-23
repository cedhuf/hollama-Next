import { json } from '@sveltejs/kit';

import { requireUser } from '$lib/server/api';
import { getSettings } from '$lib/server/db/collections';
import { resolveTools } from '$lib/server/toolsResolver';

// Server mode only: the tool policy that applies to the current user, so the GUI
// can show the right controls. It is advisory. `/api/fetch` enforces it again.
export async function GET(event) {
	const user = await requireUser(event);
	return json(resolveTools(getSettings(user.id), user.role === 'admin'));
}
