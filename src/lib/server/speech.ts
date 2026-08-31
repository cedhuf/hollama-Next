import { costLookupFor, modelKind, speechFor, type ConnectionType } from '$lib/connections';
import { getModelKinds, getServerApiKey, type ServerRow } from '$lib/server/db/servers';
import { wavFromPcm } from '$lib/server/wav';

/**
 * Reading a sentence out loud.
 *
 * The mirror of `transcription.ts`, and server-side for the same reason: the key
 * lives here. The browser hands over text and gets back sound it can play; it
 * never learns where the sound came from.
 *
 * Nothing is assumed about a connection that has not said it synthesises. Every
 * OpenAI-compatible endpoint answers `/audio/transcriptions`, so transcription
 * can take a default and be right almost always. Hardly any answer
 * `/audio/speech`, so this one asks the descriptor and refuses when it is silent,
 * rather than inventing a route and turning every press into a 404.
 *
 * What stays here rather than in a descriptor is everything that is a defence: how
 * much text may be sent at once, how long this is willing to wait, and what it is
 * willing to play back. A descriptor says where to knock. It never says how much
 * to trust the answer.
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
 * How much is read in one go.
 *
 * Not a limit on how much can be read: the caller splits a long answer into
 * sentences and asks for them one after another, which is also what lets the
 * first one start playing while the rest is still being made. This is the ceiling
 * on a single chunk, wide enough for any sentence anybody writes and narrow
 * enough that a runaway request cannot bill an account for a novel.
 */
export const SPEECH_LIMIT = 2_000;

/** A voice is a name, so it is short and it has no business carrying newlines. */
const VOICE_LIMIT = 64;

/**
 * How patient the app is, which is the app's business and not a provider's.
 *
 * One chunk of speech is a second or two of work. Thirty is the point past which
 * something has gone wrong rather than slowly, and holding the request open any
 * longer only delays saying so.
 */
const SPEECH_TIMEOUT_MS = 30_000;

/**
 * What may be played.
 *
 * The response is relayed to a browser and handed to an `<audio>` element, so the
 * type it arrives with matters: an endpoint that answered with HTML, or with a
 * JSON error carrying a 200, must not reach the page dressed as sound. This is
 * the list of what an answer to one of the formats below can honestly be, and
 * anything else is refused however confidently it was sent.
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
 * The formats the app knows how to ask for, best first.
 *
 * A provider names what it serves; this decides which of those names is worth
 * asking for, and in what order. `pcm` sits last rather than being excluded: it
 * is raw samples with no rate in the answer to assemble them by, which is why it
 * cannot be relayed as it arrives, but a rate is not actually unknown here and
 * the header that carries it is forty-four bytes. It goes out as a wav.
 */
const ASKABLE = ['mp3', 'opus', 'aac', 'flac', 'wav', 'pcm'];

/** What the OpenAI contract produces, and so what to ask for when nobody says. */
const DEFAULT_FORMAT = 'mp3';

/**
 * The rate raw samples come back at.
 *
 * Not a guess and not configurable: both routes that serve `pcm` document one
 * rate and produce only that one. OpenAI's `/audio/speech` says 24 kHz, 16-bit,
 * mono, little-endian, and Gemini's speech models emit the same, which is what
 * reaches this app through an OpenAI-shaped proxy. A provider that one day serves
 * something else would need to say so in its descriptor rather than have this
 * quietly widened.
 */
const PCM_RATE = 24_000;

/**
 * What raw samples may arrive labelled as.
 *
 * Wider than `PLAYABLE` on purpose, and it is only reached when this asked for
 * `pcm`: there is no agreed type for a naked buffer, so the routes that serve one
 * label it as audio, as sixteen-bit linear, or as nothing in particular. Every
 * one of them means the same thing, and none of them is a page of HTML.
 */
const RAW = ['audio/pcm', 'audio/l16', 'audio/x-pcm', 'application/octet-stream', ''];

/**
 * Which format a model actually accepted, once it has answered once.
 *
 * A connection serves several speech models and they do not agree: on OpenRouter
 * the OpenAI voices take mp3 and the Gemini ones refuse everything but `pcm`,
 * with a 400 that names the reason. So the descriptor can only say what the
 * *provider* offers, and the model is asked. Remembering the answer is what keeps
 * that from costing a refused request in front of every sentence of every reply.
 *
 * Keyed by connection and model, never by voice: the format is a property of the
 * route, and no provider varies it by which voice was chosen.
 */
const accepted = new Map<string, string>();

export interface Spoken {
	audio: ArrayBuffer;
	type: string;
	/**
	 * The handle this generation answers to, when the provider gave one.
	 *
	 * The audio is the answer, so there is no usage block to read: what a
	 * synthesis cost has to be asked for separately, afterwards, by whoever wants
	 * to know. Handed back rather than resolved here so the sound leaves without
	 * waiting on a question nobody listening cares about.
	 */
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

	// Every one of these endpoints requires a voice and refuses without one, so an
	// empty value is caught here rather than after the wait.
	const named = voice.trim();
	if (!named) throw new SpeechError(400, 'No voice chosen');
	if (named.length > VOICE_LIMIT || /[\r\n]/.test(named)) {
		throw new SpeechError(400, 'That is not a voice name');
	}

	const key = getServerApiKey(server);
	const target = rules.url({ baseUrl: server.base_url.replace(/\/+$/, '') });

	// Everything this connection offers that this app can handle, in the order the
	// provider named: a descriptor lists its first choice first. A connection whose
	// whole list is unusable is refused here rather than after the wait and after
	// the meter has run.
	const offered = (rules.formats ?? [DEFAULT_FORMAT]).filter((name) => ASKABLE.includes(name));
	if (!offered.length) throw new SpeechError(400, 'That connection serves nothing this can play');

	// What worked last time first, and the rest behind it. A model that has never
	// answered is simply asked in the preferred order.
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
			// The provider refusing the request itself, which is the one failure another
			// format could fix: it is how a model says it serves only raw samples. Kept
			// in case it is also the last word, so what comes back is the provider's own
			// sentence rather than a summary of several.
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

/**
 * One request, in one format.
 *
 * Separated from `speak` because it is asked more than once: the caller walks the
 * formats a connection offers until a model stops refusing, so everything that is
 * decided per request lives here and everything decided per call stays there.
 */
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
		// The provider's own words, which are usually the actionable ones ("unknown
		// voice", "input too long"). A 401 is the exception: that is the instance's
		// key, not the business of whoever pressed play.
		throw new SpeechError(
			response.status === 401 ? 502 : response.status,
			detail.slice(0, 500) || 'Reading aloud failed'
		);
	}

	const type = (response.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
	const bytes = await response.arrayBuffer();

	if (format === 'pcm') {
		if (!RAW.includes(type)) throw new SpeechError(502, `The voice answered with ${type}`);
		// Given the header it was missing, here rather than anywhere later: a browser
		// cannot play a naked buffer, and neither the route that relays this to an
		// `<audio>` element nor the voice socket should have a second case to carry for
		// what is one provider's choice of encoding.
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
 * How long to keep asking what a synthesis cost, and how patiently.
 *
 * Asking once is not enough, and that is the whole reason these exist. The
 * request that made the sound and the request that asks what it cost are two
 * requests, and the second can arrive before the provider has finished writing
 * the record the first one produced. Asked once, immediately, it comes back
 * empty and the call goes uncounted: an accounting hole made out of a few hundred
 * milliseconds.
 *
 * Widening gaps rather than a fixed one. The record is normally there by the
 * second ask, and the later attempts are for the times something is genuinely
 * slow rather than merely not instant.
 */
const COST_RETRIES = [400, 1_200, 3_000, 8_000];

/**
 * Go back and ask what one synthesis cost.
 *
 * Called after the sound has gone out, never before. Whoever is waiting for an
 * answer should not also wait on the accounting, and a lookup that fails should
 * cost a missing figure rather than a missing sentence. Nothing here throws, for
 * the same reason.
 *
 * Nothing when the provider names no way to ask, or when nobody ever answers with
 * a figure. Nothing is not zero: the caller falls back to the connection's own
 * price table, where a zero would have recorded the call as free.
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
			// A 404 here reads as "not yet", not as "never": the record for a generation
			// that certainly happened is still being written. Anything else is an
			// answer, and asking again would not change it.
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

/**
 * The voices one model offers, when the provider will say.
 *
 * An empty list is a real answer and not a failure: it means this connection
 * publishes no names, and the field asks for one to be typed instead. Anything
 * that goes wrong reaching the provider says the same thing, because a voice
 * picker that cannot be filled is a voice picker that should get out of the way.
 */
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
