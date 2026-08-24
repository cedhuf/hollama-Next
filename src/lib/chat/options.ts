import type { OllamaOptions } from './ollama';

/**
 * The three families the old parameters panel treated as one list.
 *
 * They are three because they answer to three different owners. The first is
 * about the answer and every provider understands it. The second is about the
 * answer too, but only llama.cpp has the vocabulary for it. The third is not
 * about the answer at all: it describes the machine the model is loaded on, and
 * a conversation is the wrong place to keep a fact about somebody's graphics
 * card.
 *
 * Splitting them is what makes the rest of this possible. A panel that shows
 * thirty fields under one heading cannot say which of them will reach the
 * endpoint you are actually talking to, and the answer used to be "some of
 * them", silently.
 */

/**
 * Sampling every provider takes.
 *
 * Stored under Ollama's names because that is the vocabulary the app grew up
 * with; `samplingFrom()` in `chat/openai.ts` translates them on the way out.
 */
export const PORTABLE_SAMPLING_KEYS = [
	'temperature',
	'top_p',
	'seed',
	'stop',
	'presence_penalty',
	'frequency_penalty',
	'num_predict'
] as const;

/**
 * Sampling only an Ollama endpoint understands.
 *
 * Deliberately never sent to an OpenAI-compatible endpoint: one that does not
 * know a field answers 400 rather than ignoring it, which costs a whole turn
 * over a setting nobody asked to be strict about.
 */
export const OLLAMA_SAMPLING_KEYS = [
	'num_keep',
	'top_k',
	'min_p',
	'tfs_z',
	'typical_p',
	'repeat_last_n',
	'repeat_penalty',
	'mirostat',
	'mirostat_tau',
	'mirostat_eta',
	'penalize_newline'
] as const;

/**
 * How the model is loaded, which is a fact about the server and not about the
 * conversation.
 *
 * `num_ctx` is not here even though it is loading-time in Ollama's own terms:
 * the app reads it as the conversation's context window for the load meter, on
 * every provider, so it belongs with the settings a person picks per
 * conversation rather than with the ones an administrator picks per machine.
 */
export const LOAD_KEYS = [
	'numa',
	'num_batch',
	'num_gpu',
	'main_gpu',
	'low_vram',
	'f16_kv',
	'vocab_only',
	'use_mmap',
	'use_mlock',
	'num_thread'
] as const;

/** The load keys that are a count, as opposed to a switch. */
export const LOAD_NUMBER_KEYS = [
	'num_batch',
	'num_gpu',
	'main_gpu',
	'num_thread'
] as const satisfies readonly LoadKey[];

/** The load keys that are a switch. Every one of them defaults to off nowhere: see below. */
export const LOAD_BOOLEAN_KEYS = [
	'numa',
	'low_vram',
	'f16_kv',
	'vocab_only',
	'use_mmap',
	'use_mlock'
] as const satisfies readonly LoadKey[];

export type PortableSamplingKey = (typeof PORTABLE_SAMPLING_KEYS)[number];
export type OllamaSamplingKey = (typeof OLLAMA_SAMPLING_KEYS)[number];
export type LoadKey = (typeof LOAD_KEYS)[number];

/**
 * Everything a conversation may still carry: both sampling families plus the
 * context window.
 */
export const SAMPLING_KEYS = [
	'num_ctx',
	...PORTABLE_SAMPLING_KEYS,
	...OLLAMA_SAMPLING_KEYS
] as const;

export type SamplingKey = (typeof SAMPLING_KEYS)[number];

export type SamplingOptions = Partial<Pick<OllamaOptions, SamplingKey>>;
export type LoadOptions = Partial<Pick<OllamaOptions, LoadKey>>;

const SAMPLING_KEY_SET: ReadonlySet<string> = new Set(SAMPLING_KEYS);
const LOAD_KEY_SET: ReadonlySet<string> = new Set(LOAD_KEYS);

/** Whether a name is one of the sampling settings a conversation may set. */
export function isSamplingKey(key: string): key is SamplingKey {
	return SAMPLING_KEY_SET.has(key);
}

/**
 * A conversation's options with the machine settings taken out.
 *
 * Applied where conversations are read, so values written by the old panel stop
 * being sent without anybody running a migration over stored conversations. The
 * strip is on the way out of storage rather than on the way in, which means it
 * also covers a conversation restored from an export written months ago.
 *
 * They were never a choice anyone made: the old panel bound its checkboxes
 * straight to the conversation, so opening it once wrote half a dozen `false`
 * values that were then sent on every turn, forcing `use_mmap` off on a server
 * that wanted it on.
 */
export function stripLoadOptions(options: Partial<OllamaOptions> | undefined): SamplingOptions {
	if (!options) return {};
	const kept: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(options)) {
		if (LOAD_KEY_SET.has(key)) continue;
		kept[key] = value;
	}
	return kept as SamplingOptions;
}

/**
 * The load settings out of whatever was stored, ignoring anything else.
 *
 * The column is JSON written by this app, but it is still parsed rather than
 * trusted: a hand-edited row should cost a setting, not a request that Ollama
 * rejects for a field it has never heard of.
 */
export function parseLoadOptions(raw: unknown): LoadOptions {
	if (typeof raw === 'string') {
		try {
			return parseLoadOptions(JSON.parse(raw));
		} catch {
			return {};
		}
	}
	if (!raw || typeof raw !== 'object') return {};
	const source = raw as Record<string, unknown>;
	const out: Record<string, unknown> = {};
	for (const key of LOAD_NUMBER_KEYS) {
		const value = source[key];
		if (typeof value === 'number' && Number.isFinite(value)) out[key] = value;
	}
	for (const key of LOAD_BOOLEAN_KEYS) {
		if (typeof source[key] === 'boolean') out[key] = source[key];
	}
	return out as LoadOptions;
}

/**
 * The two halves put back together for one request.
 *
 * The conversation wins, but only where it actually says something: an absent
 * key is absent, never `undefined` sitting on top of the connection's value.
 * That distinction is the whole reason the old bug was a bug.
 */
export function withLoadOptions(
	options: Partial<OllamaOptions> | undefined,
	load: LoadOptions | undefined
): Partial<OllamaOptions> | undefined {
	const stripped = stripLoadOptions(options);
	const merged = { ...(load ?? {}), ...definedOnly(stripped) };
	return Object.keys(merged).length ? (merged as Partial<OllamaOptions>) : undefined;
}

/** The entries that carry a value. `undefined` is how this app spells "unset". */
function definedOnly<T extends object>(source: T): T {
	const out: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(source)) {
		if (value !== undefined) out[key] = value;
	}
	return out as T;
}

/**
 * Which sampling settings a request may carry, given who is answering it.
 *
 * The second family is dropped for anything that is not Ollama rather than left
 * to the endpoint to complain about. `samplingFrom()` already drops it on the
 * OpenAI path; this is the same answer one step earlier, so a panel can tell the
 * user which of their settings this conversation will actually use.
 */
export function samplingKeysFor(isOllama: boolean): readonly SamplingKey[] {
	return isOllama ? SAMPLING_KEYS : (['num_ctx', ...PORTABLE_SAMPLING_KEYS] as const);
}
