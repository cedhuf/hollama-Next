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
		// Infomaniak embeds the product ID directly in the endpoint path, so we
		// treat it as a plain OpenAI-compatible server: the user pastes the URL
		// (replacing the {productId} placeholder) and their API key.
		type: ConnectionType.Infomaniak,
		name: 'Infomaniak',
		family: 'openai',
		identified: false,
		baseUrl: 'https://api.infomaniak.com/2/ai/{productId}/openai/v1',
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
 * Whether the composer should offer the per-conversation Reasoning toggle: Ollama
 * (native thinking) plus any endpoint that takes the explicit thinking flag.
 */
export function supportsReasoningToggle(connectionType: ConnectionType): boolean {
	return connectionType === ConnectionType.Ollama || supportsThinkingRequest(connectionType);
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
