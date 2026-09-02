import { modelKind, transcriptionFor, type ConnectionType } from '$lib/connections';
import { getModelKinds, getServerApiKey, type ServerRow } from '$lib/server/db/servers';
import type { RunUsage } from '$lib/usageCounts';

/**
 * Turning what somebody said into what they meant to type. Server-side because
 * the key lives here.
 *
 * OpenAI-compatible only: Ollama serves language models, not speech ones.
 *
 * Where a provider says more than the contract does, its own file carries it.
 * What stays here is every defence: what may be uploaded, how large, how long
 * this waits, and how often it asks.
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

/** `MediaRecorder` gives webm on Chromium and mp4 on Safari. Short on purpose: this is an upload, so what it accepts is a decision. */
const AUDIO_TYPES = ['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/wav'];

/** Long enough for a minute of speech on a busy queue, short enough that a job nobody will answer stops holding a request open. */
const POLL_INTERVAL_MS = 1_500;
const POLL_CEILING_MS = 90_000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function transcribe(
	server: ServerRow,
	model: string,
	audio: File,
	/** Empty means letting the model work it out. It is reliable on a full sentence and a guess on three words, which is most of what gets said to a phone. */
	language = ''
): Promise<{ text: string; used: RunUsage }> {
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
	const target = rules?.url ? rules.url(roots) : `${server.base_url}/audio/transcriptions`;

	// Only where the provider says its endpoint takes one: an extra multipart field
	// is not free, and a server that does not know it may refuse the whole upload.
	if (rules?.language && language) form.set(rules.language, language);

	let response: Response;
	try {
		response = await fetch(target, {
			method: 'POST',
			// No content type of ours: `FormData` sets it, with the boundary.
			headers: auth,
			body: form
		});
	} catch {
		throw new TranscriptionError(502, 'The transcription provider could not be reached');
	}

	if (!response.ok) throw providerError(response, await response.text().catch(() => ''));

	const accepted = await readBody(response);
	if (!rules?.poll) return { text: readText(accepted), used: readUsage(accepted) };

	// Asynchronous: what came back is a receipt, and the words are collected once
	// the job is done.
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
			// A job that says it will never answer is not worth another eighty seconds.
			throw new TranscriptionError(502, `Transcription failed: ${state.failed}`);
		}
		if (state.done) return { text: (state.text ?? '').trim(), used: readUsage(body) };
	}

	// The last thing the provider said: an unexpected shape is the likeliest reason
	// this timed out.
	throw new TranscriptionError(504, `Transcription timed out. Last answer: ${last.slice(0, 300)}`);
}

/** "Audio too short" is something the person who spoke can act on. A 401 is the exception: that is the instance's key, not their problem. */
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
 * Every field is optional and an absent one is not a zero: the caller falls back
 * to the price table when nothing was reported, and an invented zero would be
 * recorded as a free call.
 *
 * `seconds` is the length of the audio rather than of the request, which is the
 * right reading for a provider billing by the minute.
 */
function readUsage(body: unknown): RunUsage {
	const usage = (body as { usage?: Record<string, unknown> })?.usage;
	const number = (value: unknown) => (typeof value === 'number' ? value : undefined);
	return {
		input: number(usage?.input_tokens ?? usage?.prompt_tokens) ?? 0,
		output: number(usage?.output_tokens ?? usage?.completion_tokens) ?? 0,
		seconds: number(usage?.seconds),
		cost: number(usage?.cost)
	};
}

/** Both shapes are in the wild: `{ text }` for json, and the bare string for the text and srt formats. */
function readText(body: unknown): string {
	if (typeof body === 'string') return body.trim();
	const text = (body as { text?: unknown })?.text;
	return typeof text === 'string' ? text.trim() : '';
}
