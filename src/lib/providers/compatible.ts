import type { ProviderDescriptor } from './types';

/**
 * Anything that speaks OpenAI's protocol, which is the door for everything this
 * folder has not described: a provider nobody wrote a file for arrives here and
 * loses only the things that need knowing in advance.
 *
 * Almost nothing is claimed on its behalf, and the silence is the content. Some
 * of these support tool calling, some accept the field and ignore it, some
 * answer 400, and there is no way to ask, so the answer is no and `force` is how
 * you say otherwise. `enable_thinking` is the exception: a field these servers
 * ignore when they do not implement it.
 */
export const compatible: ProviderDescriptor = {
	id: 'openai-compatible',
	name: 'OpenAI-compatible',
	family: 'openai',
	identified: false,
	baseUrl: 'http://localhost:8080/v1',
	requiresApiKey: false,
	badge: { id: 'compatible', color: '#888780' },
	thinkingRequest: true,
	imageGeneration: true
};
