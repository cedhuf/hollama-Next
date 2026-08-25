import { error, json } from '@sveltejs/kit';

import { requireUser } from '$lib/server/api';
import { getServer } from '$lib/server/db/servers';
import { transcribe, TranscriptionError } from '$lib/server/transcription';

/**
 * What was just said, as words.
 *
 * Multipart in, one line of text out. Nothing is kept: the recording exists for
 * the length of this request and the text goes into a composer the person then
 * reads before sending it. A dictation that quietly stored the sound would be a
 * microphone in somebody's room with an archive attached.
 */
export async function POST(event) {
	const user = await requireUser(event);

	const form = await event.request.formData().catch(() => null);
	const audio = form?.get('audio');
	const serverId = form?.get('serverId');
	const model = form?.get('model');

	if (!(audio instanceof File) || typeof serverId !== 'string' || typeof model !== 'string') {
		throw error(400, 'serverId, model and audio are required');
	}

	const server = getServer(serverId);
	if (!server) throw error(404, 'Server not found');
	// The same two questions the relay asks: is this connection yours to use, and
	// is it switched on.
	if (server.owner_user_id !== null && server.owner_user_id !== user.id) {
		throw error(403, 'Forbidden');
	}
	if (!server.is_enabled) throw error(403, 'Server is disabled');

	try {
		return json(await transcribe(server, model, audio));
	} catch (cause) {
		if (cause instanceof TranscriptionError) throw error(cause.status, cause.message);
		throw cause;
	}
}
