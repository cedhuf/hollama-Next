import { error, json } from '@sveltejs/kit';

import { refusal } from '$lib/chat/refusal';
import { requireServer, requireSharedModel, requireUser } from '$lib/server/api';
import { askWhatItCost, listVoices, speak, SpeechError } from '$lib/server/speech';
import { recordVoiceUsage, refuseForCredit } from '$lib/server/usageMeter';

/**
 * A sentence, as sound.
 *
 * JSON in, audio bytes out, and nothing kept at either end: the sound exists for
 * the length of this response and is played from a blob the page drops when it is
 * done. There is no cache, deliberately. Caching would mean storing what somebody
 * was told, keyed by what they asked, which is a transcript of a conversation
 * written to disk by the one part of the app that had no reason to hold one.
 *
 * `GET` on the same route answers the other question a voice picker has: which
 * voices this model offers.
 */

export async function POST(event) {
	const user = await requireUser(event);

	const body = await event.request.json().catch(() => null);
	const { serverId, model, voice, text } = (body ?? {}) as Record<string, unknown>;
	if (typeof model !== 'string' || typeof voice !== 'string' || typeof text !== 'string') {
		throw error(400, 'serverId, model, voice and text are required');
	}

	const server = requireServer(user.id, serverId);
	requireSharedModel(server, user.role === 'admin', model);

	const refused = refuseForCredit(user.id, server, model);
	if (refused) throw error(402, refusal(refused, model));

	try {
		const { audio, type, generationId } = await speak(server, model, voice, text);

		/**
		 * The accounting, after the fact and beside the answer.
		 *
		 * A synthesis answers with sound, so what it cost has to be asked for
		 * separately, and making somebody wait on that question would put a round
		 * trip between them and a sentence they are listening for. So it is not
		 * awaited: the audio returns now, the figure is written down when it
		 * arrives, and a lookup that fails costs a missing figure and nothing else.
		 *
		 * Where a provider names no way to ask, nothing is recorded and the meter
		 * says so. The characters that were sent are not a reading anybody bills on,
		 * and turning them into tokens would be the app inventing a number and then
		 * charging for it.
		 */
		void (async () => {
			const reported = generationId ? await askWhatItCost(server, generationId) : undefined;
			recordVoiceUsage(user.id, server, model, {
				input: 0,
				output: 0,
				cost: reported
			});
		})();

		return new Response(audio, {
			headers: {
				'content-type': type,
				'content-length': String(audio.byteLength),
				// Nothing about this belongs in a shared cache, and the browser has no
				// reason to keep it either: the page holds the blob for as long as it is
				// playing it.
				'cache-control': 'no-store'
			}
		});
	} catch (cause) {
		if (cause instanceof SpeechError) throw error(cause.status, cause.message);
		throw cause;
	}
}

export async function GET(event) {
	const user = await requireUser(event);
	const model = event.url.searchParams.get('model');
	if (!model) throw error(400, 'model is required');

	const server = requireServer(user.id, event.url.searchParams.get('serverId'));
	// The voice list is about a model, so it is only answered for a model this
	// account may actually use. Otherwise the picker becomes a way to enumerate
	// what an administrator chose not to share.
	requireSharedModel(server, user.role === 'admin', model);
	return json({ voices: await listVoices(server, model) });
}
