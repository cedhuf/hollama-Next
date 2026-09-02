import { json } from '@sveltejs/kit';

import { requireUser } from '$lib/server/api';
import { resolveAppPrompts } from '$lib/server/appPromptsResolver';
import { getSettings } from '$lib/server/db/collections';
import { resolveSystemPrompts } from '$lib/server/systemPromptsResolver';

/** One route because the Prompts screen shows both, and would otherwise open on two round trips that can disagree for a frame. */
export async function GET(event) {
	const user = await requireUser(event);
	const settings = getSettings(user.id);
	const isAdmin = user.role === 'admin';
	return json({
		systemPrompts: resolveSystemPrompts(settings, isAdmin),
		appPrompts: resolveAppPrompts(settings, isAdmin)
	});
}
