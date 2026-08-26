import { costLookupFor, modelKind, speechFor, type ConnectionType } from '$lib/connections';
import { getModelKinds, getServerApiKey, type ServerRow } from '$lib/server/db/servers';

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
 * The formats the app knows how to ask for and can then play.
 *
 * A provider names what it serves; this decides which of those names is worth
 * asking for. `pcm` is deliberately absent, and it is the reason any of this
 * exists: it is OpenRouter's default, it is raw samples with no rate in the
 * answer to assemble them by, and a browser cannot play it from a blob. A
 * descriptor may say a provider offers it. It may not make the app ask for it.
 */
const ASKABLE = ['mp3', 'opus', 'aac', 'flac', 'wav'];

/** What the OpenAI contract produces, and so what to ask for when nobody says. */
const DEFAULT_FORMAT = 'mp3';

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

	// The provider's first choice that this app can play, and mp3 when it has named
	// nothing. A provider whose whole list is unplayable is refused here rather than
	// after the wait and after the meter has run.
	const format = (rules.formats ?? [DEFAULT_FORMAT]).find((name) => ASKABLE.includes(name));
	if (!format) throw new SpeechError(400, 'That connection serves nothing this can play');

	let response: Response;
	try {
		response = await fetch(target, {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				...(key ? { authorization: `Bearer ${key}` } : {})
			},
			body: JSON.stringify({ model, input, voice: named, response_format: format }),
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
	if (!PLAYABLE.includes(type)) {
		throw new SpeechError(502, `The voice answered with ${type || 'nothing playable'}`);
	}

	const lookup = costLookupFor(server.connection_type as ConnectionType);
	const generationId = lookup ? (response.headers.get(lookup.header) ?? undefined) : undefined;

	return { audio: await response.arrayBuffer(), type, generationId };
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
