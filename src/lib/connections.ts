import type { LoadOptions } from '$lib/chat/options';
import {
	describeProvider,
	PROVIDER_DESCRIPTORS,
	type ModelKind,
	type ProviderDescriptor
} from '$lib/providers';

import { generateRandomId } from './utils';

export enum ConnectionType {
	Ollama = 'ollama',
	OpenAI = 'openai',
	OpenRouter = 'openrouter',
	OpenAICompatible = 'openai-compatible',
	Anthropic = 'anthropic',
	Infomaniak = 'infomaniak'
}

export interface Server {
	id: string;
	baseUrl: string;
	connectionType: ConnectionType;
	isVerified: Date | null;
	isEnabled: boolean;
	label?: string;
	modelFilter?: string;
	apiKey?: string;
	/** Accent used for this connection's badge; falls back to the provider default. */
	color?: string;
	/** Display-only, keyed by the real model id. Never sent, never persisted on a session: `model.name` stays the identifier. */
	modelLabels?: Record<string, string>;
	/**
	 * What a million tokens costs here, keyed by the real model id: the price is a
	 * fact about *where* a model runs. Absent means unpriced, which is not free: an
	 * unpriced conversation is not counted rather than counted as zero.
	 */
	modelPricing?: Record<string, ModelPrice>;
	/**
	 * What each model is for, and only where somebody disagreed with the guess:
	 * `modelKind()` reads the name when there is no entry. Per connection, since the
	 * same id can be a chat model on one endpoint and absent from the next.
	 *
	 * It exists because no provider says: `/v1/models` returns ids and nothing else.
	 */
	modelKinds?: Record<string, ModelKind>;
	/**
	 * Where this connection's image endpoints live, when that is not where its chat
	 * endpoint lives. Empty means the same base.
	 *
	 * Infomaniak forced the question (chat on v2 under `/openai/v1`, images on v1
	 * under `/openai`), but so does llama.cpp for chat and ComfyUI for pictures.
	 */
	imageBaseUrl?: string;
	/**
	 * How this Ollama loads a model: threads, GPU layers, mmap and the rest.
	 *
	 * On the connection because that is what they describe: facts about one machine.
	 * On the conversation, merely opening the parameters panel wrote `false` into
	 * every checkbox. Every other kind of connection ignores it.
	 */
	loadOptions?: LoadOptions;
}

/** Default badge colour and short id per provider, dark-mode safe. */
export const PROVIDER_BADGES: Record<string, { id: string; color: string }> = Object.fromEntries(
	PROVIDER_DESCRIPTORS.map((provider) => [provider.id, provider.badge])
);

/** Palette a connection's colour is drawn from. */
export const SERVER_COLORS = [
	'#1D9E75',
	'#378ADD',
	'#D85A30',
	'#BA7517',
	'#6366f1',
	'#8b5cf6',
	'#ec4899',
	'#14b8a6',
	'#eab308',
	'#888780'
] as const;

/**
 * What a model is billed by. Four, because that is what providers publish and
 * the app converts nothing: an image is billed per image by OpenAI, per second
 * by Replicate and per minute by Infomaniak, so a price typed from an invoice
 * reads back the way the invoice wrote it.
 */
export type PriceUnit = 'token' | 'image' | 'second' | 'minute';

export const PRICE_UNITS: PriceUnit[] = ['token', 'image', 'second', 'minute'];

/**
 * The price of one model on one connection.
 *
 * Tokens keep two numbers, since the ratio between them is why a long
 * conversation costs what it does. Every other unit has one. `unit` absent means
 * tokens, which is what rows written before there was anything else are.
 */
export interface ModelPrice {
	/** What this is billed by. Absent means `token`. */
	unit?: PriceUnit;
	/** Per million tokens sent. `token` only. */
	input?: number;
	/** Per million tokens returned. `token` only. */
	output?: number;
	/** Per image, per second or per minute, depending on `unit`. */
	rate?: number;
	/** Per model, since one account can be billed in more than one. Nothing is converted, here or anywhere. */
	currency?: string;
}

/** What a price is billed by, with the default rows written before units spelled out. */
export function priceUnit(price: Pick<ModelPrice, 'unit'> | undefined): PriceUnit {
	return price?.unit ?? 'token';
}

/**
 * The one place that decides, because "unpriced" is load-bearing: such a model
 * is not counted rather than counted as free, and is refused outright while a
 * credit limit is in force. Which field carries the figure depends on the unit.
 */
export function hasPriceFigure(price: ModelPrice | undefined): boolean {
	if (!price) return false;
	return priceUnit(price) === 'token'
		? price.input != null || price.output != null
		: price.rate != null;
}

/** What one model costs here, or nothing when it has never been priced. */
export function modelPrice(
	server: Pick<Server, 'modelPricing'> | undefined,
	name: string
): ModelPrice | undefined {
	const price = server?.modelPricing?.[name];
	return hasPriceFigure(price) ? price : undefined;
}

/**
 * Names that give a model away. Embeddings first: `bge_multilingual_gemma2`
 * carries the name of a chat model inside it. Substrings, since every family
 * arrives as a dozen sizes, dates and quantisations.
 */
const EMBEDDING_HINTS = [
	'embed',
	'bge-',
	'bge_',
	'gte-',
	'e5-',
	'minilm',
	'mini_lm',
	'nomic-embed',
	'mxbai',
	'arctic-embed',
	'reranker',
	'rerank'
];

/**
 * Sound, in the two directions it runs: the words the industry uses, not a list
 * of models.
 *
 * Speaking is checked first, and the order is load-bearing:
 * `mistralai/voxtral-mini-tts-2603` carries the name of a transcription family
 * and is a voice.
 *
 * Deliberately not exhaustive: `fish-audio/transcribe-1` listens and
 * `fish-audio/s1` talks, and no substring tells them apart. A provider that will
 * answer outright is asked instead, see `catalogues` in the descriptors.
 */
const SPEECH_HINTS = ['tts', 'kokoro', 'orpheus', 'text-to-speech'];

const AUDIO_HINTS = [
	'whisper',
	'wav2vec',
	'parakeet',
	'transcribe',
	'voxtral',
	'chirp',
	'asr',
	'stt',
	'speech-to-text'
];

const IMAGE_HINTS = [
	'dall-e',
	'dalle',
	'gpt-image',
	'flux',
	'stable-diffusion',
	'sdxl',
	'sd3',
	'imagen',
	'ideogram',
	'recraft',
	'playground-v',
	'kandinsky',
	'seedream',
	'hidream',
	'qwen-image',
	'photomaker',
	'photo_maker',
	'janus'
];

/**
 * What a model is, read from its name, for a connection nobody has sorted yet.
 *
 * A guess, and named one: right often enough that a fresh connection lands in
 * the right sections, wrong often enough to stay overridable through
 * `modelKinds`. Text is the fallback because it fails loudly, where an image
 * model missing from the chat picker looks like a connection that never synced.
 */
export function guessModelKind(name: string): ModelKind {
	const id = name.toLowerCase();
	if (EMBEDDING_HINTS.some((hint) => id.includes(hint))) return 'embedding';
	if (SPEECH_HINTS.some((hint) => id.includes(hint))) return 'speech';
	if (AUDIO_HINTS.some((hint) => id.includes(hint))) return 'audio';
	if (IMAGE_HINTS.some((hint) => id.includes(hint))) return 'image';
	return 'text';
}

/** What this model is here: what somebody said, or what its name suggests. */
export function modelKind(server: Pick<Server, 'modelKinds'> | undefined, name: string): ModelKind {
	return server?.modelKinds?.[name] ?? guessModelKind(name);
}

/** How a model should read on screen: its custom label when set, its id otherwise. */
export function modelLabel(server: Pick<Server, 'modelLabels'> | undefined, name: string): string {
	return server?.modelLabels?.[name]?.trim() || name;
}

/** Every connection gets its own colour at creation; the provider default only covers older rows. */
export function serverBadge(server: Pick<Server, 'connectionType' | 'color'>) {
	const fallback = PROVIDER_BADGES[server.connectionType] ?? { id: '', color: '#888780' };
	return { id: fallback.id, color: server.color || fallback.color };
}

/** Prefers a colour nobody else is using, then picks at random once the palette is exhausted. */
export function pickServerColor(usedColors: (string | undefined)[] = []): string {
	const used = new Set(usedColors.filter(Boolean).map((color) => color!.toLowerCase()));
	const free = SERVER_COLORS.filter((color) => !used.has(color.toLowerCase()));
	const pool = free.length ? free : SERVER_COLORS;
	return pool[Math.floor(Math.random() * pool.length)];
}

/**
 * Up to two letters standing in for a connection: initials for a multi-word name,
 * the first two characters otherwise.
 */
export function serverInitials(name: string): string {
	const words = name.split(/[\s\-_/.]+/).filter(Boolean);
	if (words.length > 1) return (words[0][0] + words[1][0]).toUpperCase();
	const first = words[0] ?? '';
	if (!first) return '?';
	return first.charAt(0).toUpperCase() + first.charAt(1).toLowerCase();
}

/** The chat base whenever nothing says otherwise. About a connection rather than a provider, which is why it is here. */
export function imageBaseUrl(server: Pick<Server, 'baseUrl' | 'imageBaseUrl'>): string {
	return server.imageBaseUrl?.trim() || server.baseUrl;
}

/** A view of the descriptor rather than a second copy: the facts live in `$lib/providers`, one file each. */
export interface ProviderInfo {
	type: ConnectionType;
	/** Display name: proper nouns, not translated. */
	name: string;
	/** OpenAI-compatible providers use the OpenAI chat strategy. */
	family: 'ollama' | 'openai';
	/** Fixed/preset endpoint vs. user-defined. */
	identified: boolean;
	baseUrl: string;
	modelFilter?: string;
	requiresApiKey: boolean;
	apiKeyHelpUrl?: string;
}

const toProviderInfo = (descriptor: ProviderDescriptor): ProviderInfo => ({
	type: descriptor.id as ConnectionType,
	name: descriptor.name,
	family: descriptor.family,
	identified: descriptor.identified,
	baseUrl: descriptor.baseUrl,
	modelFilter: descriptor.modelFilter,
	requiresApiKey: descriptor.requiresApiKey,
	apiKeyHelpUrl: descriptor.apiKeyHelpUrl
});

export const PROVIDERS: ProviderInfo[] = PROVIDER_DESCRIPTORS.map(toProviderInfo);

export function getProvider(connectionType: ConnectionType): ProviderInfo {
	return toProviderInfo(describeProvider(connectionType));
}

/** How this connection transcribes, when it does not do it the usual way. */
export function transcriptionFor(connectionType: ConnectionType) {
	return describeProvider(connectionType).transcription;
}

/** Nothing is assumed in its absence, unlike transcription: hardly any endpoint serves `/audio/speech`, and a speaker that 404s on every press is worse than none. */
export function speechFor(connectionType: ConnectionType) {
	return describeProvider(connectionType).speech;
}

/** Only the asking is gated. Reading a `usage.cost` that turns up in an answer is done everywhere. */
export function reportsCost(connectionType: ConnectionType): boolean {
	return !!describeProvider(connectionType).reportsCost;
}

/** Nothing for a connection that reports nothing, which is not an unknown currency: there is no figure of its own to label. */
export function reportedCurrency(connectionType: ConnectionType): string | undefined {
	return describeProvider(connectionType).reportsCost?.currency;
}

/** Where to go back and ask what a call cost, for a route that answers with bytes. */
export function costLookupFor(connectionType: ConnectionType) {
	return describeProvider(connectionType).costLookup;
}

/** Whether reading aloud is offered on this kind of connection at all. */
export function supportsSpeech(connectionType: ConnectionType): boolean {
	return !!describeProvider(connectionType).speech;
}

/** Whether a connection talks to an OpenAI-compatible endpoint. */
export function isOpenAiCompatible(connectionType: ConnectionType): boolean {
	return describeProvider(connectionType).family === 'openai';
}

/**
 * Whether this connection accepts an explicit "enable thinking" request flag
 * (`chat_template_kwargs.enable_thinking`).
 */
export function supportsThinkingRequest(connectionType: ConnectionType): boolean {
	return describeProvider(connectionType).thinkingRequest === true;
}

/** Ollama does too, but only for some models, so it answers per model and its descriptor stays silent here. */
export function supportsNativeTools(connectionType: ConnectionType): boolean {
	return describeProvider(connectionType).nativeTools === true;
}

/** Whether this kind of connection can draw at all. */
export function supportsImageGeneration(connectionType: ConnectionType): boolean {
	return describeProvider(connectionType).imageGeneration === true;
}

/**
 * Whether the composer should offer the per-conversation Reasoning toggle: a
 * provider with thinking of its own, plus any endpoint that takes the flag.
 */
export function supportsReasoningToggle(connectionType: ConnectionType): boolean {
	const descriptor = describeProvider(connectionType);
	return descriptor.nativeThinking === true || descriptor.thinkingRequest === true;
}

export function getDefaultServer(
	connectionType: ConnectionType,
	/** Colours already taken, so the new connection gets a distinct one. */
	usedColors: (string | undefined)[] = []
): Server {
	const provider = getProvider(connectionType);

	return {
		id: generateRandomId(),
		// A provider whose address is built from one field starts blank rather than
		// carrying its template, which is what makes the form refuse to sync.
		baseUrl: describeProvider(connectionType).urlField ? '' : provider.baseUrl,
		connectionType,
		modelFilter: provider.modelFilter,
		color: pickServerColor(usedColors),
		isVerified: null,
		isEnabled: false
	};
}

/** Re-exported, so the rest of the app keeps one import for "what is a connection". */
export {
	type Catalogue,
	declaredModels,
	extraCatalogues,
	IMAGE_QUALITIES,
	IMAGE_RATIOS,
	type ImageOptions,
	imageOptionsFor,
	type ImageQuality,
	type ImageRatio,
	INFOMANIAK_URL_TEMPLATE,
	MODEL_KINDS,
	type ModelKind,
	infomaniakBaseUrl,
	infomaniakImageBaseUrl,
	infomaniakProductId,
	qualityFor,
	type ReferenceImages,
	referencesFor,
	sizeFor
} from '$lib/providers';
