import { costLookupFor, modelKind, speechFor, type ConnectionType } from '$lib/connections';
import { getModelKinds, getServerApiKey, type ServerRow } from '$lib/server/db/servers';
import { wavFromPcm } from '$lib/server/wav';

/**
 * Reading a sentence out loud. The mirror of `transcription.ts`, and
 * server-side for the same reason: the key lives here.
 *
 * Nothing is assumed about a connection that has not said it synthesises.
 * Almost no endpoint answers `/audio/speech`, so this asks the descriptor and
 * refuses when it is silent rather than turning every press into a 404.
 *
 * What stays here rather than in a descriptor is every defence: how much text
 * may be sent, how long this waits, and what it is willing to play back.
 */

export class SpeechError extends Error {
	constructor(
		readonly status: number,
		message: string
	) {
		super(message);
	}
}

/**
 * How much is read in one go, not a limit on how much can be read: the caller
 * splits an answer into sentences, which is also what lets the first play while
 * the rest is made. Wide enough for any sentence, narrow enough that a runaway
 * request cannot bill an account for a novel.
 */
export const SPEECH_LIMIT = 2_000;

/** A voice is a name, so it is short and it has no business carrying newlines. */
const VOICE_LIMIT = 64;

/** One chunk is a second or two of work. Thirty is the point past which something has gone wrong rather than slowly. */
const SPEECH_TIMEOUT_MS = 30_000;

/**
 * What may be played. The response is relayed to an `<audio>` element, so an
 * endpoint answering with HTML, or with a JSON error carrying a 200, must not
 * reach the page dressed as sound.
 */
const PLAYABLE = [
	'audio/mpeg',
	'audio/mp3',
	'audio/mpeg3',
	'audio/wav',
	'audio/x-wav',
	'audio/ogg',
	'audio/opus',
	'audio/aac',
	'audio/flac'
];

/**
 * The formats the app knows how to ask for, best first. `pcm` is last rather
 * than excluded: it is raw samples with no rate in the answer, but the rate is
 * known here and the header that carries it is forty-four bytes, so it goes out
 * as a wav.
 */
const ASKABLE = ['mp3', 'opus', 'aac', 'flac', 'wav', 'pcm'];

/** What the OpenAI contract produces, and so what to ask for when nobody says. */
const DEFAULT_FORMAT = 'mp3';

/**
 * The rate raw samples come back at. Not a guess: both routes that serve `pcm`
 * document 24 kHz, 16-bit, mono, little-endian, and produce only that. A
 * provider serving something else would say so in its descriptor.
 */
const PCM_RATE = 24_000;

/** Wider than `PLAYABLE`, and only reached when this asked for `pcm`: there is no agreed type for a naked buffer, and none of these is a page of HTML. */
const RAW = ['audio/pcm', 'audio/l16', 'audio/x-pcm', 'application/octet-stream', ''];

/**
 * Which format a model actually accepted, once it has answered once.
 *
 * A connection serves several speech models that disagree: on OpenRouter the
 * OpenAI voices take mp3 and the Gemini ones refuse everything but `pcm`. So the
 * descriptor says what the provider offers and the model is asked, and this
 * keeps that from costing a refused request per sentence.
 *
 * Keyed by connection and model, never by voice: the format is the route's.
 */
const accepted = new Map<string, string>();

export interface Spoken {
	audio: ArrayBuffer;
	type: string;
	/** The audio is the answer, so there is no usage block: what a synthesis cost is asked for separately, afterwards. Handed back so the sound leaves without waiting. */
	generationId?: string;
}

export async function speak(
	server: ServerRow,
	model: string,
	voice: string,
	text: string
): Promise<Spoken> {
	const rules = speechFor(server.connection_type as ConnectionType);
	if (!rules) throw new SpeechError(400, 'That connection does not read aloud');
	if (modelKind({ modelKinds: getModelKinds(server.id) }, model) !== 'speech') {
		throw new SpeechError(400, 'That model does not read aloud');
	}

	const input = text.trim();
	if (!input) throw new SpeechError(400, 'Nothing to read');
	if (input.length > SPEECH_LIMIT) throw new SpeechError(413, 'Too much text to read at once');

	// Every one of these endpoints requires a voice, so an empty value is caught
	// here rather than after the wait.
	const named = voice.trim();
	if (!named) throw new SpeechError(400, 'No voice chosen');
	if (named.length > VOICE_LIMIT || /[\r\n]/.test(named)) {
		throw new SpeechError(400, 'That is not a voice name');
	}

	const key = getServerApiKey(server);
	const target = rules.url({ baseUrl: server.base_url.replace(/\/+$/, '') });

	// Everything this connection offers that this app can handle, in the order the
	// provider named. A connection whose whole list is unusable is refused here,
	// before the wait and before the meter runs.
	const offered = (rules.formats ?? [DEFAULT_FORMAT]).filter((name) => ASKABLE.includes(name));
	if (!offered.length) throw new SpeechError(400, 'That connection serves nothing this can play');

	// What worked last time first. A model that has never answered is asked in the
	// preferred order.
	const remembered = accepted.get(`${server.id}:${model}`);
	const order = remembered
		? [remembered, ...offered.filter((name) => name !== remembered)]
		: offered;

	let refusal: SpeechError | null = null;
	for (const format of order) {
		try {
			const { audio, type, headers } = await attempt(target, key, model, named, input, format);
			accepted.set(`${server.id}:${model}`, format);
			return { audio, type, generationId: reported(server, headers) };
		} catch (cause) {
			if (!(cause instanceof SpeechError) || cause.status !== 400) throw cause;
			// The provider refusing the request itself is the one failure another format
			// could fix: it is how a model says it serves only raw samples. Kept in case it
			// is also the last word.
			refusal = cause;
		}
	}

	throw refusal ?? new SpeechError(502, 'Reading aloud failed');
}

/** What the provider called this generation, when it says. */
function reported(server: ServerRow, headers: Headers): string | undefined {
	const lookup = costLookupFor(server.connection_type as ConnectionType);
	return lookup ? (headers.get(lookup.header) ?? undefined) : undefined;
}

/** Separate from `speak` because it is asked more than once: everything decided per request lives here, everything per call stays there. */
async function attempt(
	target: string,
	key: string | null,
	model: string,
	voice: string,
	input: string,
	format: string
): Promise<{ audio: ArrayBuffer; type: string; headers: Headers }> {
	let response: Response;
	try {
		response = await fetch(target, {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				...(key ? { authorization: `Bearer ${key}` } : {})
			},
			body: JSON.stringify({ model, input, voice, response_format: format }),
			signal: AbortSignal.timeout(SPEECH_TIMEOUT_MS)
		});
	} catch (cause) {
		if (cause instanceof Error && cause.name === 'TimeoutError') {
			throw new SpeechError(504, 'The voice took too long to answer');
		}
		throw new SpeechError(502, 'The speech provider could not be reached');
	}

	if (!response.ok) {
		const detail = await response.text().catch(() => '');
		// The provider's own words are usually the actionable ones. A 401 is the
		// exception: that is the instance's key, not the business of whoever pressed play.
		throw new SpeechError(
			response.status === 401 ? 502 : response.status,
			detail.slice(0, 500) || 'Reading aloud failed'
		);
	}

	const type = (response.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
	const bytes = await response.arrayBuffer();

	if (format === 'pcm') {
		if (!RAW.includes(type)) throw new SpeechError(502, `The voice answered with ${type}`);
		// Given the header it was missing, here rather than later: a browser cannot
		// play a naked buffer, and neither the relay route nor the voice socket should
		// carry a second case for one provider's choice of encoding.
		const wav = wavFromPcm([Buffer.from(bytes)], PCM_RATE);
		return {
			audio: wav.buffer.slice(wav.byteOffset, wav.byteOffset + wav.byteLength) as ArrayBuffer,
			type: 'audio/wav',
			headers: response.headers
		};
	}

	if (!PLAYABLE.includes(type)) {
		throw new SpeechError(502, `The voice answered with ${type || 'nothing playable'}`);
	}

	return { audio: bytes, type, headers: response.headers };
}

/**
 * How long to keep asking what a synthesis cost.
 *
 * Two requests: the one that made the sound and the one that asks its price, and
 * the second can arrive before the provider has written the record. Asked once,
 * it comes back empty and the call goes uncounted.
 *
 * Widening gaps: the record is normally there by the second ask, and the later
 * attempts are for genuinely slow rather than merely not instant.
 */
const COST_RETRIES = [400, 1_200, 3_000, 8_000];

/**
 * Go back and ask what one synthesis cost, after the sound has gone out. Nothing
 * here throws: a failed lookup should cost a missing figure, not a missing
 * sentence.
 *
 * Nothing is not zero: the caller falls back to the connection's price table,
 * where a zero would have recorded the call as free.
 */
export async function askWhatItCost(
	server: ServerRow,
	generationId: string
): Promise<number | undefined> {
	const lookup = costLookupFor(server.connection_type as ConnectionType);
	if (!lookup) return undefined;

	const key = getServerApiKey(server);
	const url = lookup.url({ baseUrl: server.base_url.replace(/\/+$/, '') }, generationId);
	const headers: Record<string, string> = key ? { authorization: `Bearer ${key}` } : {};

	for (const wait of COST_RETRIES) {
		await new Promise((resolve) => setTimeout(resolve, wait));

		try {
			const response = await fetch(url, { headers, signal: AbortSignal.timeout(10_000) });
			// A 404 here reads as "not yet", not "never": the record for a generation that
			// certainly happened is still being written.
			if (response.status === 404) continue;
			if (!response.ok) return undefined;

			const found = lookup.read(await response.json());
			if (found !== undefined) return found;
		} catch {
			// A network hiccup is worth one more try, on the same grounds.
		}
	}

	return undefined;
}

/** An empty list is a real answer: the connection publishes no names, so the field asks for one to be typed. A failure says the same, since a picker that cannot be filled should get out of the way. */
export async function listVoices(server: ServerRow, model: string): Promise<string[]> {
	const rules = speechFor(server.connection_type as ConnectionType)?.voices;
	if (!rules) return [];

	const key = getServerApiKey(server);
	try {
		const response = await fetch(rules.url({ baseUrl: server.base_url.replace(/\/+$/, '') }), {
			headers: key ? { authorization: `Bearer ${key}` } : {},
			signal: AbortSignal.timeout(SPEECH_TIMEOUT_MS)
		});
		if (!response.ok) return [];
		return rules.read(await response.json(), model);
	} catch {
		return [];
	}
}
