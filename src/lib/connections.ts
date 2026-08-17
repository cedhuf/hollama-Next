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
	 * What this provider bills in, as a currency code.
	 *
	 * Per connection, because that is where it is true: an account with one
	 * provider is billed in dollars and another in euros, and a single figure
	 * across both would be an addition nobody can defend. Free text, since the app
	 * does no conversion and never should on its own.
	 */
	currency?: string;
}

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
 * The price of a million tokens, in the connection's currency.
 *
 * Two numbers because that is how every provider publishes them, and because the
 * ratio between them is the whole reason a long conversation costs what it does.
 * Optional each: a provider that bills one and not the other is a provider, not
 * an error.
 */
export interface ModelPrice {
	/** Per million tokens sent. */
	input?: number;
	/** Per million tokens returned. */
	output?: number;
	/**
	 * What this model is billed in, when it is not the connection's currency.
	 *
	 * Per model because one account can be billed in more than one, and because a
	 * limit that adds currencies together should at least be able to know that it
	 * is doing so. Nothing is converted, here or anywhere.
	 */
	currency?: string;
}

/** What one model costs here, or nothing when it has never been priced. */
export function modelPrice(
	server: Pick<Server, 'modelPricing'> | undefined,
	name: string
): ModelPrice | undefined {
	const price = server?.modelPricing?.[name];
	if (!price) return undefined;
	return price.input == null && price.output == null ? undefined : price;
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

/** The endpoint for a product ID, or nothing when there is no ID to build it from. */
export function infomaniakBaseUrl(productId: string): string {
	const id = productId.trim();
	return id ? INFOMANIAK_URL_TEMPLATE.replace('{productId}', id) : '';
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
