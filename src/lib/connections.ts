import { describeProvider, PROVIDER_DESCRIPTORS, type ProviderDescriptor } from '$lib/providers';

import { generateRandomId } from './utils';

export enum ConnectionType {
	Ollama = 'ollama',
	OpenAI = 'openai',
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
	/**
	 * Display-only overrides, keyed by the real model id. Never sent to the API and
	 * never persisted on sessions — `model.name` stays the single identifier.
	 */
	modelLabels?: Record<string, string>;
	/**
	 * What a million tokens costs on this connection, keyed by the real model id.
	 *
	 * On the connection rather than on the model name, because the price is a fact
	 * about *where* the model runs: the same id is billed differently by two
	 * providers and costs nothing at all on an Ollama in the next room. Keyed like
	 * `modelLabels`, so both answer "what do I know about this model here" from the
	 * same place.
	 *
	 * Absent means unpriced, which is not the same as free: a conversation on an
	 * unpriced model is not counted rather than counted as zero.
	 */
	modelPricing?: Record<string, ModelPrice>;
	/**
	 * What each of this connection's models is for, keyed like the two maps above.
	 *
	 * Sparse, and only where somebody disagreed with the guess: `modelKind()` reads
	 * the name when there is no entry, so a fresh connection is already sorted
	 * without anyone touching a hundred rows. Stored per connection for the same
	 * reason the price is: the same id can be a chat model on one endpoint and
	 * absent from the next.
	 *
	 * It exists because no provider says. `/v1/models` returns a list of ids and
	 * nothing else, and Ollama does not list image models at all. Guessing from the
	 * name is the only signal there is, so the guess has to be correctable.
	 */
	modelKinds?: Record<string, ModelKind>;
	/**
	 * Where this connection's image endpoints live, when that is not where its
	 * chat endpoint lives. Empty means the same base, which is the usual case.
	 *
	 * It exists because one base URL turned out to be an assumption rather than a
	 * fact. OpenAI serves `chat/completions` and `images/generations` off the same
	 * root, so appending a path reaches both. Infomaniak does not: chat is on API
	 * version 2 under `/openai/v1`, images are only on version 1 under `/openai`,
	 * and no amount of path appending gets from one to the other.
	 *
	 * Not an Infomaniak special case, though it is what forced the question. A
	 * self-hosted setup running llama.cpp for chat and ComfyUI for pictures is two
	 * different hosts, and this is the field that says so.
	 */
	imageBaseUrl?: string;
}

/**
 * What a model does, which is the question every picker in the app is really
 * asking.
 *
 * Four, because a provider's catalogue holds four sorts of thing and only the
 * first two are offered anywhere: something you hold a conversation with,
 * something that draws, something that returns a vector, and something that
 * turns speech into text. The last two are here to be recognised and left out.
 * An embedding model in the chat picker is not a cosmetic problem, it is a 400
 * with no explanation, and the same is true of a transcription model.
 *
 * Infomaniak's own catalogue declares `llm`, `image`, `embedding`, `reranker`
 * and `stt`. Rerankers fold in with embeddings here: both are retrieval-side,
 * neither is ever offered, and inventing a section for a category the app will
 * never call would be describing the provider rather than the app.
 */
export type ModelKind = 'text' | 'image' | 'embedding' | 'audio';

export const MODEL_KINDS: ModelKind[] = ['text', 'image', 'embedding', 'audio'];

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
 * What a model is billed by.
 *
 * Four, because that is what providers actually publish and the app converts
 * nothing. Tokens for anything you talk to. An image model is billed per image
 * by OpenAI, per second of compute by Replicate, and per minute by Infomaniak —
 * and a minute is not a second scaled by sixty as far as the person typing the
 * figure is concerned. Storing the unit as published means a price typed from an
 * invoice reads back the way the invoice wrote it.
 */
export type PriceUnit = 'token' | 'image' | 'second' | 'minute';

export const PRICE_UNITS: PriceUnit[] = ['token', 'image', 'second', 'minute'];

/**
 * The price of one model on one connection, in the currency beside it.
 *
 * Tokens keep two numbers, because that is how every text provider publishes
 * them and because the ratio between them is the whole reason a long
 * conversation costs what it does. Every other unit has one, since nothing that
 * is billed per image or per second bills the way in differently from the way
 * out.
 *
 * `unit` absent means tokens. Rows written before there was anything else are
 * token prices, and rewriting them to say so would have been a migration that
 * changes no behaviour.
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
	/**
	 * What this model is billed in, when it is not the connection's currency.
	 *
	 * Per model because one account can be billed in more than one, and because a
	 * limit that adds currencies together should at least be able to know that it
	 * is doing so. Nothing is converted, here or anywhere.
	 */
	currency?: string;
}

/** What a price is billed by, with the default rows written before units spelled out. */
export function priceUnit(price: Pick<ModelPrice, 'unit'> | undefined): PriceUnit {
	return price?.unit ?? 'token';
}

/**
 * Whether anybody has actually given this price a figure.
 *
 * The one place that decides, because "unpriced" is load-bearing: an unpriced
 * model is not counted at all rather than counted as free, and while a credit
 * limit is in force it is refused outright. Which field carries the figure
 * depends on the unit, so asking about `input` alone stopped being the question
 * the moment there was more than one unit.
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
 * Names that give a model away, checked before anything is assumed.
 *
 * Embeddings first: `bge_multilingual_gemma2` carries the name of a chat model
 * inside it, and reading it as one is exactly the mistake this exists to stop.
 * Substrings rather than exact ids because nobody ships one id — every family
 * arrives as a dozen sizes, dates and quantisations, and a list of exact names
 * is a list that is wrong by the end of the month.
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

/** Speech, which is neither something to talk to nor something that draws. */
const AUDIO_HINTS = ['whisper', 'wav2vec', 'parakeet', 'distil-whisper', 'transcribe', 'tts-'];

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
 * A guess, and named one. It is right often enough that a freshly synced
 * connection lands in the right sections on its own, and wrong often enough that
 * the answer has to stay overridable — which is what `modelKinds` is for. Text
 * is the fallback because it is both the commonest and the least destructive
 * mistake: a text model offered for drawing fails loudly at the first request,
 * where an image model quietly missing from the chat picker looks like the
 * connection never synced.
 */
export function guessModelKind(name: string): ModelKind {
	const id = name.toLowerCase();
	if (EMBEDDING_HINTS.some((hint) => id.includes(hint))) return 'embedding';
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

/**
 * The badge for a connection. Every connection gets its own colour at creation;
 * the provider default only covers rows created before that was the case.
 */
export function serverBadge(server: Pick<Server, 'connectionType' | 'color'>) {
	const fallback = PROVIDER_BADGES[server.connectionType] ?? { id: '', color: '#888780' };
	return { id: fallback.id, color: server.color || fallback.color };
}

/**
 * A colour for a new connection, preferring one nobody else is using — two
 * providers sharing an accent would defeat the point of colouring them at all.
 * Once the palette is exhausted it just picks at random.
 */
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

/**
 * Where to send a drawing on this connection.
 *
 * The chat base whenever nothing says otherwise, so every provider that serves
 * both from one root needs no configuration and none of this is visible to it.
 * About a connection rather than about a provider, which is why it lives here
 * and not in a descriptor.
 */
export function imageBaseUrl(server: Pick<Server, 'baseUrl' | 'imageBaseUrl'>): string {
	return server.imageBaseUrl?.trim() || server.baseUrl;
}

/**
 * What the connection form needs to know about a provider.
 *
 * A view of the descriptor rather than a second copy of it: the facts live in
 * `$lib/providers`, one file each, and this is the shape the form already reads.
 * Kept so nothing that renders a connection had to change when they moved.
 */
export interface ProviderInfo {
	type: ConnectionType;
	/** Display name — proper nouns, not translated. */
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

/**
 * Whether an endpoint is known to accept a `tools` array.
 *
 * Ollama does too, but only for some models, so it answers for itself per model
 * and its descriptor deliberately stays silent here.
 */
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
		// carrying its template: an endpoint with a placeholder still in it is not a
		// working endpoint, and leaving it empty is what makes the form refuse to
		// sync until the value is given.
		baseUrl: describeProvider(connectionType).urlField ? '' : provider.baseUrl,
		connectionType,
		modelFilter: provider.modelFilter,
		color: pickServerColor(usedColors),
		isVerified: null,
		isEnabled: false
	};
}

/**
 * Everything a provider decides about itself, re-exported so the rest of the app
 * keeps one import for "what is a connection" and never has to know which file a
 * particular provider's facts happen to live in.
 */
export {
	declaredModels,
	IMAGE_QUALITIES,
	IMAGE_RATIOS,
	type ImageOptions,
	imageOptionsFor,
	type ImageQuality,
	type ImageRatio,
	INFOMANIAK_URL_TEMPLATE,
	infomaniakBaseUrl,
	infomaniakImageBaseUrl,
	infomaniakProductId,
	qualityFor,
	type ReferenceImages,
	referencesFor,
	sizeFor
} from '$lib/providers';
