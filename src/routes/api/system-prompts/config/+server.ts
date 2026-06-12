import { json } from '@sveltejs/kit';

import { requireUser } from '$lib/server/api';
import { getSettings } from '$lib/server/db/collections';
import { resolveSystemPrompts } from '$lib/server/systemPromptsResolver';

// Server mode only: the resolved system prompts for the current user, so the
// GUI knows whether they're editable or shared (read-only) by an admin.
export async function GET(event) {
	const user = await requireUser(event);
	return json(resolveSystemPrompts(getSettings(user.id), user.role === 'admin'));
}
