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
	productId?: string;
}

/**
 * Metadata describing each provider. Drives the provider picker cards and the
 * per-connection form. `identified` providers have a fixed/known endpoint, so
 * the user mostly just needs to supply an API key — the Base URL is hidden by
 * default. Non-identified providers (Ollama, OpenAI-compatible) expose the
 * Base URL as their primary field.
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
	requiresProductId?: boolean;
	apiKeyHelpUrl?: string;
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
		type: ConnectionType.Infomaniak,
		name: 'Infomaniak',
		family: 'openai',
		identified: true,
		baseUrl: '',
		requiresApiKey: true,
		requiresProductId: true,
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

/** Infomaniak's endpoint is fully determined by the product ID (API v2). */
export function infomaniakBaseUrl(productId: string): string {
	return `https://api.infomaniak.com/2/ai/${productId}/openai/v1`;
}

export function getDefaultServer(connectionType: ConnectionType): Server {
	const provider = getProvider(connectionType);

	return {
		id: generateRandomId(),
		baseUrl: provider.baseUrl,
		connectionType,
		modelFilter: provider.modelFilter,
		isVerified: null,
		isEnabled: false
	};
}
