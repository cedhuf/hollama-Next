import type { ProviderDescriptor } from './types';

/**
 * OpenAI.
 *
 * The one provider here that serves two image models with different answers, and
 * the reason model rules exist at all: a portrait is 1024x1536 on `gpt-image-1`
 * and 1024x1792 on `dall-e-3`, and their quality words are not the same words
 * either — `low`/`medium`/`high` against `standard`/`hd`.
 *
 * No provider-level `images` block, deliberately. Anything that is neither of
 * those two is a model this file has not been told about, and the honest answer
 * for it is to send no size and no quality rather than one model's answer for
 * another's.
 */
export const openai: ProviderDescriptor = {
	id: 'openai',
	name: 'OpenAI',
	family: 'openai',
	identified: true,
	baseUrl: 'https://api.openai.com/v1',
	modelFilter: 'gpt',
	requiresApiKey: true,
	apiKeyHelpUrl: 'https://help.openai.com/en/articles/4936850-where-do-i-find-my-openai-api-key',
	badge: { id: 'openai', color: '#378ADD' },
	nativeTools: true,
	imageGeneration: true,
	modelRules: [
		{
			matches: ['gpt-image'],
			images: {
				sizes: { square: '1024x1024', portrait: '1024x1536', landscape: '1536x1024' },
				qualities: { low: 'low', standard: 'medium', high: 'high' }
			}
		},
		{
			matches: ['dall-e-3'],
			images: {
				sizes: { square: '1024x1024', portrait: '1024x1792', landscape: '1792x1024' },
				// Two steps where the app offers three, so the bottom two collapse.
				qualities: { low: 'standard', standard: 'standard', high: 'hd' }
			}
		}
	]
};
