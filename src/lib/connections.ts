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
export const PROVIDER_BADGES: Record<string, { id: string; color: string }> = {
	[ConnectionType.Ollama]: { id: 'ollama', color: '#1D9E75' },
	[ConnectionType.OpenAI]: { id: 'openai', color: '#378ADD' },
	[ConnectionType.Anthropic]: { id: 'claude', color: '#D85A30' },
	[ConnectionType.Infomaniak]: { id: 'infomaniak', color: '#BA7517' },
	[ConnectionType.OpenAICompatible]: { id: 'compatible', color: '#888780' }
};

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
 * Metadata describing each provider. Drives the provider picker cards and the
 * per-connection form. `identified` providers have a known endpoint, so the user
 * supplies an API key and little else, and the Base URL is hidden under Advanced.
 * Non-identified ones (Ollama, OpenAI-compatible) expose it as their main field.
 *
 * Infomaniak counts as identified even though its URL is not one fixed string:
 * it varies only by the product ID, which the form asks for directly.
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

/**
 * Infomaniak's endpoint, bar the product ID that identifies the user's AI Tools
 * subscription. Everything else about the URL is fixed.
 */
export const INFOMANIAK_URL_TEMPLATE = 'https://api.infomaniak.com/2/ai/{productId}/openai/v1';

/**
 * Infomaniak's image endpoints, which are not under its chat endpoint.
 *
 * A different API version and no `/v1`, both of which are theirs to decide and
 * neither of which can be reached from the chat base. Chat stays on version 2
 * deliberately: version 1's chat route is marked deprecated in their own
 * specification, and version 2 is the one that documents function calling and
 * multimodal input, which this app uses. Images have no version 2 route at all.
 */
export const INFOMANIAK_IMAGE_URL_TEMPLATE = 'https://api.infomaniak.com/1/ai/{productId}/openai';

/** The endpoint for a product ID, or nothing when there is no ID to build it from. */
export function infomaniakBaseUrl(productId: string): string {
	const id = productId.trim();
	return id ? INFOMANIAK_URL_TEMPLATE.replace('{productId}', id) : '';
}

/** The image endpoint for a product ID, built from the same one field. */
export function infomaniakImageBaseUrl(productId: string): string {
	const id = productId.trim();
	return id ? INFOMANIAK_IMAGE_URL_TEMPLATE.replace('{productId}', id) : '';
}

/**
 * Where to send a drawing on this connection.
 *
 * The chat base whenever nothing says otherwise, so every provider that serves
 * both from one root needs no configuration and none of this is visible to it.
 */
export function imageBaseUrl(server: Pick<Server, 'baseUrl' | 'imageBaseUrl'>): string {
	return server.imageBaseUrl?.trim() || server.baseUrl;
}

/**
 * The product ID out of a stored endpoint.
 *
 * Lets the form show a field for something that was never stored as a field, so
 * connections configured before this keep working and fill the input in on their
 * own. An unsubstituted placeholder reads as no ID at all, which is what it is.
 */
export function infomaniakProductId(baseUrl: string): string {
	const found = baseUrl?.match(/\/ai\/([^/]+)\/openai/)?.[1] ?? '';
	return found === '{productId}' ? '' : found;
}

export const PROVIDERS: ProviderInfo[] = [
	{
		type: ConnectionType.Ollama,
		name: 'Ollama',
		family: 'ollama',
		identified: false,
		baseUrl: 'http://localhost:11434',
		requiresApiKey: false
	},
	{
		type: ConnectionType.OpenAI,
		name: 'OpenAI',
		family: 'openai',
		identified: true,
		baseUrl: 'https://api.openai.com/v1',
		modelFilter: 'gpt',
		requiresApiKey: true,
		apiKeyHelpUrl: 'https://help.openai.com/en/articles/4936850-where-do-i-find-my-openai-api-key'
	},
	{
		type: ConnectionType.Anthropic,
		name: 'Claude',
		family: 'openai',
		identified: true,
		baseUrl: 'https://api.anthropic.com/v1',
		modelFilter: 'claude',
		requiresApiKey: true,
		apiKeyHelpUrl: 'https://console.anthropic.com/settings/keys'
	},
	{
		// The endpoint is fixed except for the product ID in its path, so the form
		// asks for that one value and builds the URL. Asking for the whole URL with a
		// {productId} placeholder in it, which is what this used to do, sends the
		// placeholder itself to the API the moment anyone misses it.
		type: ConnectionType.Infomaniak,
		name: 'Infomaniak',
		family: 'openai',
		identified: true,
		baseUrl: INFOMANIAK_URL_TEMPLATE,
		requiresApiKey: true,
		apiKeyHelpUrl: 'https://manager.infomaniak.com/v3/infomaniak-api'
	},
	{
		type: ConnectionType.OpenAICompatible,
		name: 'OpenAI-compatible',
		family: 'openai',
		identified: false,
		baseUrl: 'http://localhost:8080/v1',
		requiresApiKey: false
	}
];

export function getProvider(connectionType: ConnectionType): ProviderInfo {
	return PROVIDERS.find((p) => p.type === connectionType) ?? PROVIDERS[0];
}

/** Whether a connection talks to an OpenAI-compatible endpoint. */
export function isOpenAiCompatible(connectionType: ConnectionType): boolean {
	return getProvider(connectionType).family === 'openai';
}

/**
 * Whether this connection accepts an explicit "enable thinking" request flag
 * (`chat_template_kwargs.enable_thinking`). Self-hosted OpenAI-compatible servers
 * (vLLM / llama.cpp / SGLang) and Infomaniak (a generic OpenAI-compatible endpoint,
 * typically vLLM-backed) take it. Hosted OpenAI / Claude reject unknown body fields,
 * and Ollama has its own native `think` path — so they're excluded here.
 */
export function supportsThinkingRequest(connectionType: ConnectionType): boolean {
	return (
		connectionType === ConnectionType.OpenAICompatible ||
		connectionType === ConnectionType.Infomaniak
	);
}

/**
 * Whether an endpoint is known to accept a `tools` array.
 *
 * The hosted providers all do, and have for long enough that a version check
 * would be noise. Ollama does too, but only for some models, so it answers for
 * itself per model and is deliberately not listed here. What is left is
 * `OpenAICompatible`: llama.cpp, vLLM, SGLang, LM Studio, a proxy someone wrote
 * last week. Some support tool calling, some accept the field and ignore it, some
 * return 400. There is no way to ask, so the honest answer is no, and the user
 * who knows better says so with the `force` setting.
 */
export function supportsNativeTools(connectionType: ConnectionType): boolean {
	return (
		connectionType === ConnectionType.OpenAI ||
		connectionType === ConnectionType.Anthropic ||
		connectionType === ConnectionType.Infomaniak
	);
}

/**
 * Whether this kind of connection can draw at all.
 *
 * Ollama has no image endpoint, and Anthropic does not generate pictures — it
 * reads them. What is left either serves OpenAI's `images/generations` or is
 * something self-hosted pretending to, which is the same request either way.
 * Used to decide whether the connection form has any business asking where its
 * image endpoint lives.
 */
export function supportsImageGeneration(connectionType: ConnectionType): boolean {
	return (
		connectionType === ConnectionType.OpenAI ||
		connectionType === ConnectionType.Infomaniak ||
		connectionType === ConnectionType.OpenAICompatible
	);
}

/**
 * Whether the composer should offer the per-conversation Reasoning toggle: Ollama
 * (native thinking) plus any endpoint that takes the explicit thinking flag.
 */
export function supportsReasoningToggle(connectionType: ConnectionType): boolean {
	return connectionType === ConnectionType.Ollama || supportsThinkingRequest(connectionType);
}

export function getDefaultServer(
	connectionType: ConnectionType,
	/** Colours already taken, so the new connection gets a distinct one. */
	usedColors: (string | undefined)[] = []
): Server {
	const provider = getProvider(connectionType);

	return {
		id: generateRandomId(),
		// Infomaniak starts empty rather than with its template: an endpoint that
		// still has `{productId}` in it is not a working endpoint, and leaving it
		// blank is what makes the form refuse to sync until the ID is given.
		baseUrl: connectionType === ConnectionType.Infomaniak ? '' : provider.baseUrl,
		connectionType,
		modelFilter: provider.modelFilter,
		color: pickServerColor(usedColors),
		isVerified: null,
		isEnabled: false
	};
}
