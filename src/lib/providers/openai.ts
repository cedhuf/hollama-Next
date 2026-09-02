import type { ProviderDescriptor } from './types';

/**
 * OpenAI.
 *
 * The one provider serving two image models with different answers, and the
 * reason model rules exist: a portrait is 1024x1536 on `gpt-image-1` and
 * 1024x1792 on `dall-e-3`.
 *
 * `dall-e-2` is absent: its edit endpoint takes one square PNG under 4 MB and an
 * optional mask, none of which a descriptor can say. And no provider-level
 * `images` block, so a model this file has not been told about gets no size and
 * no quality.
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
	// The one thing worth saying about their transcription: the form takes a
	// language, and `whisper-1` is markedly better for being told.
	transcription: { language: 'language' },
	modelRules: [
		{
			matches: ['gpt-image'],
			images: {
				sizes: { square: '1024x1024', portrait: '1024x1536', landscape: '1536x1024' },
				qualities: { low: 'low', standard: 'medium', high: 'high' }
			},
			references: {
				max: 16,
				field: 'image[]',
				sendsModel: true,
				url: ({ imageBaseUrl }) => `${imageBaseUrl}/images/edits`
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
