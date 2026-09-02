import type { ProviderDescriptor } from './types';

/** Claude. Reads pictures and does not draw them, so `imageGeneration` stays off: there is no image endpoint to point the gallery at. */
export const anthropic: ProviderDescriptor = {
	id: 'anthropic',
	name: 'Claude',
	family: 'openai',
	identified: true,
	baseUrl: 'https://api.anthropic.com/v1',
	modelFilter: 'claude',
	requiresApiKey: true,
	apiKeyHelpUrl: 'https://console.anthropic.com/settings/keys',
	badge: { id: 'claude', color: '#D85A30' },
	nativeTools: true
};
