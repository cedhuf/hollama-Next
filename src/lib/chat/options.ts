import type { OllamaOptions } from './ollama';

/**
 * The three families the old parameters panel treated as one list, split
 * because they answer to three owners: what every provider understands, what
 * only llama.cpp has the vocabulary for, and what describes the machine the
 * model is loaded on.
 *
 * A panel that shows thirty fields under one heading cannot say which of them
 * will reach the endpoint you are talking to, and the answer used to be "some
 * of them", silently.
 */

/** Stored under Ollama's names, which is the vocabulary the app grew up with; `samplingFrom()` translates them on the way out. */
export const PORTABLE_SAMPLING_KEYS = [
	'temperature',
	'top_p',
	'seed',
	'stop',
	'presence_penalty',
	'frequency_penalty',
	'num_predict'
] as const;

/** Never sent to an OpenAI-compatible endpoint: one that does not know a field answers 400 rather than ignoring it. */
export const OLLAMA_SAMPLING_KEYS = [
	'num_keep',
	'top_k',
	'min_p',
	'typical_p',
	'repeat_last_n',
	'repeat_penalty',
	'mirostat',
	'mirostat_tau',
	'mirostat_eta',
	'penalize_newline'
] as const;

/**
 * How the model is loaded, which is a fact about the server rather than the
 * conversation. `num_ctx` is not here despite being loading-time in Ollama's
 * terms: the app reads it as the conversation's context window on every
 * provider.
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

/** The load keys that are a switch. */
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
 * A conversation's options with the machine settings taken out, applied where
 * conversations are read, so nothing has to migrate stored rows. On the way out
 * of storage, so it also covers an export written months ago.
 *
 * They were never a choice anyone made: the old panel bound its checkboxes
 * straight to the conversation, so opening it wrote half a dozen `false` values
 * that then forced `use_mmap` off on a server that wanted it on.
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

/** The column is JSON written by this app and still parsed rather than trusted: a hand-edited row should cost a setting, not a rejected request. */
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

/** The conversation wins, but only where it says something: an absent key is absent, never `undefined` sitting on top of the connection's value. */
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
 * What this app asks for when nobody has asked for anything: nothing.
 *
 * An absent field is the provider deciding for itself, and its own default is
 * better tuned to its own models than a number picked here. A named constant
 * rather than `{}` inline because it is a destination: the reset control puts
 * every field back to exactly this.
 */
export const SYSTEM_SAMPLING_DEFAULTS: SamplingOptions = {};

/** Sampling settings read back from wherever they were stored, minus anything else. */
export function parseSamplingOptions(raw: unknown): SamplingOptions {
	if (typeof raw === 'string') {
		try {
			return parseSamplingOptions(JSON.parse(raw));
		} catch {
			return {};
		}
	}
	if (!raw || typeof raw !== 'object') return {};
	const source = raw as Record<string, unknown>;
	const out: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(source)) {
		if (!isSamplingKey(key) || value === undefined || value === null) continue;
		if (key === 'stop') {
			const list = Array.isArray(value) ? value.filter((entry) => typeof entry === 'string') : [];
			if (list.length) out[key] = list;
			continue;
		}
		if (typeof value === 'number' ? Number.isFinite(value) : typeof value === 'boolean') {
			out[key] = value;
		}
	}
	return out as SamplingOptions;
}

/**
 * One set over another, where an absent key means "whatever is underneath" and
 * never `undefined` laid on top. The retired panel wrote `false` and `undefined`
 * for fields nobody had touched, and both were sent as though chosen.
 */
export function mergeSampling(
	base: SamplingOptions,
	over: SamplingOptions | undefined
): SamplingOptions {
	const out: Record<string, unknown> = { ...base };
	for (const [key, value] of Object.entries(over ?? {})) {
		if (value !== undefined) out[key] = value;
	}
	return out as SamplingOptions;
}

/** Whether anything has been set here at all, which is what a reset control asks. */
export function isSystemDefault(options: SamplingOptions | undefined): boolean {
	const own = parseSamplingOptions(options);
	const system = SYSTEM_SAMPLING_DEFAULTS as Record<string, unknown>;
	const keys = new Set([...Object.keys(own), ...Object.keys(system)]);
	for (const key of keys) {
		const a = (own as Record<string, unknown>)[key];
		const b = system[key];
		if (Array.isArray(a) || Array.isArray(b)) {
			if (JSON.stringify(a ?? null) !== JSON.stringify(b ?? null)) return false;
		} else if (a !== b) return false;
	}
	return true;
}

/** The Ollama-only family is dropped rather than left for the endpoint to complain about. `samplingFrom()` drops it too; this is the same answer one step earlier, so a panel can say which settings will be used. */
export function samplingKeysFor(isOllama: boolean): readonly SamplingKey[] {
	return isOllama ? SAMPLING_KEYS : (['num_ctx', ...PORTABLE_SAMPLING_KEYS] as const);
}
