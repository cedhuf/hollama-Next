import { modelKind, transcriptionFor, type ConnectionType } from '$lib/connections';
import { getModelKinds, getServerApiKey, type ServerRow } from '$lib/server/db/servers';

/**
 * Turning what somebody said into what they meant to type.
 *
 * Server-side for the same reason everything else that talks to a provider is:
 * the key lives here. The browser records, hands over the sound, and gets words
 * back; it never learns where they came from.
 *
 * OpenAI-compatible only. `/audio/transcriptions` is that family's endpoint, and
 * Ollama has nothing to answer it with: it serves language models, not speech
 * ones. A connection that cannot do this simply has no audio model to choose,
 * which is where the question is settled rather than here.
 *
 * Where a provider departs from that contract, its own file says how: which root
 * the route hangs off, and whether the answer is the words or a receipt to come
 * back for. What stays here is everything that is a defence rather than an
 * address: what may be uploaded, how large, how long this is willing to wait, and
 * how often it is willing to ask.
 */

export class TranscriptionError extends Error {
	constructor(
		readonly status: number,
		message: string
	) {
		super(message);
	}
}

/** Twenty-five megabytes, which is where the providers themselves stop. */
export const AUDIO_LIMIT = 25 * 1024 * 1024;

/**
 * The types a browser actually produces.
 *
 * `MediaRecorder` gives webm on Chromium and mp4 on Safari, and the list is
 * short on purpose: this is an upload, so what it accepts is a decision rather
 * than a courtesy.
 */
const AUDIO_TYPES = ['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/wav'];

/**
 * How patient the app is, which is the app's business and not a provider's.
 *
 * Long enough for a minute of speech on a busy queue, short enough that a job
 * nobody is ever going to answer for stops holding a request open. The interval
 * is a compromise between finding out promptly and hammering somebody's API.
 */
const POLL_INTERVAL_MS = 1_500;
const POLL_CEILING_MS = 90_000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function transcribe(
	server: ServerRow,
	model: string,
	audio: File
): Promise<{ text: string }> {
	if (modelKind({ modelKinds: getModelKinds(server.id) }, model) !== 'audio') {
		throw new TranscriptionError(400, 'That model does not transcribe');
	}
	if (audio.size === 0) throw new TranscriptionError(400, 'Nothing was recorded');
	if (audio.size > AUDIO_LIMIT) throw new TranscriptionError(413, 'Recording too large');

	const type = audio.type.split(';')[0].trim().toLowerCase();
	if (type && !AUDIO_TYPES.includes(type)) {
		throw new TranscriptionError(415, `Unsupported audio type: ${type}`);
	}

	const form = new FormData();
	form.set('file', audio, audio.name || 'speech.webm');
	form.set('model', model);

	const key = getServerApiKey(server);
	const auth: Record<string, string> = key ? { authorization: `Bearer ${key}` } : {};
	const rules = transcriptionFor(server.connection_type as ConnectionType);
	const roots = { baseUrl: server.base_url };
	const target = rules ? rules.url(roots) : `${server.base_url}/audio/transcriptions`;

	let response: Response;
	try {
		response = await fetch(target, {
			method: 'POST',
			// No content type of ours: `FormData` sets it, with the boundary, and one
			// written by hand is a request the provider cannot parse.
			headers: auth,
			body: form
		});
	} catch {
		throw new TranscriptionError(502, 'The transcription provider could not be reached');
	}

	if (!response.ok) throw providerError(response, await response.text().catch(() => ''));

	const accepted = await readBody(response);
	if (!rules?.poll) return { text: readText(accepted) };

	// Asynchronous: what came back is a receipt, and the words are collected from
	// somewhere else once the job is done.
	const pollUrl = rules.poll.url(roots, accepted);
	if (!pollUrl) throw new TranscriptionError(502, 'The provider returned no job to follow');

	const deadline = Date.now() + POLL_CEILING_MS;
	let last = '';
	while (Date.now() < deadline) {
		await sleep(POLL_INTERVAL_MS);

		let poll: Response;
		try {
			poll = await fetch(pollUrl, { headers: auth });
		} catch {
			throw new TranscriptionError(502, 'The transcription provider could not be reached');
		}
		if (!poll.ok) throw providerError(poll, await poll.text().catch(() => ''));

		const body = await readBody(poll);
		last = typeof body === 'string' ? body : JSON.stringify(body);
		const state = rules.poll.read(body);
		if (state.failed) {
			// A job that says it will never answer is not something to keep asking
			// about for another eighty seconds.
			throw new TranscriptionError(502, `Transcription failed: ${state.failed}`);
		}
		if (state.done) return { text: (state.text ?? '').trim() };
	}

	// The last thing the provider said, trimmed, because a shape nobody expected is
	// the likeliest reason this timed out and it is the thing worth reporting.
	throw new TranscriptionError(504, `Transcription timed out. Last answer: ${last.slice(0, 300)}`);
}

/**
 * The provider's own words, trimmed.
 *
 * "Audio too short" is something the person who spoke can act on, and hiding it
 * behind a generic failure sends them to their administrator for nothing. A 401
 * is the exception: that is the instance's key, not their problem.
 */
function providerError(response: Response, detail: string): TranscriptionError {
	return new TranscriptionError(
		response.status === 401 ? 502 : response.status,
		detail.slice(0, 500) || 'Transcription failed'
	);
}

/** JSON where there is JSON, the raw text otherwise: both are answers. */
async function readBody(response: Response): Promise<unknown> {
	const raw = await response.text();
	try {
		return JSON.parse(raw);
	} catch {
		return raw;
	}
}

/**
 * The words out of a synchronous answer.
 *
 * Both shapes are in the wild: `{ text }` for json, and the bare string for the
 * text and srt formats. Neither is asked for here, but a provider that answers
 * with one anyway is answering the question.
 */
function readText(body: unknown): string {
	if (typeof body === 'string') return body.trim();
	const text = (body as { text?: unknown })?.text;
	return typeof text === 'string' ? text.trim() : '';
}
