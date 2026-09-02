import { error, json } from '@sveltejs/kit';

import { refusal } from '$lib/chat/refusal';
import { requireServer, requireSharedModel, requireUser } from '$lib/server/api';
import { transcribe, TranscriptionError } from '$lib/server/transcription';
import { recordVoiceUsage, refuseForCredit } from '$lib/server/usageMeter';

/** Multipart in, one line of text out, and nothing kept: the recording exists for the length of this request. A dictation that stored the sound would be a microphone in somebody's room with an archive attached. */
export async function POST(event) {
	const user = await requireUser(event);

	const form = await event.request.formData().catch(() => null);
	const audio = form?.get('audio');
	const serverId = form?.get('serverId');
	const model = form?.get('model');
	const language = form?.get('language');

	if (!(audio instanceof File) || typeof model !== 'string') {
		throw error(400, 'serverId, model and audio are required');
	}

	const server = requireServer(user.id, serverId);
	requireSharedModel(server, user.role === 'admin', model);

	// The same two questions the chat relay asks before a billable call: is this
	// account within its allowance, and can this call be counted at all.
	const refused = refuseForCredit(user.id, server, model);
	if (refused) throw error(402, refusal(refused, model));

	try {
		// A code, or nothing. Validated to the shape rather than to a list: there are
		// ninety-nine of them, and a list here would be one more thing to be out of date
		// about.
		const spoken = typeof language === 'string' && /^[a-z]{2}$/i.test(language) ? language : '';
		const { text, used } = await transcribe(server, model, audio, spoken);
		recordVoiceUsage(user.id, server, model, used);
		return json({ text });
	} catch (cause) {
		if (cause instanceof TranscriptionError) throw error(cause.status, cause.message);
		throw cause;
	}
}
