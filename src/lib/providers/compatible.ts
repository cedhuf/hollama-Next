import type { ProviderDescriptor } from './types';

/**
 * Anything that speaks OpenAI's protocol, which is the door for everything this
 * folder has not described.
 *
 * That is what keeps the rest of the folder a convenience rather than a gate: a
 * provider nobody has written a file for is not refused, it arrives here and
 * loses only the things that need knowing in advance.
 *
 * Almost nothing is claimed on its behalf, and the silence is the content. It is
 * llama.cpp, or vLLM, or SGLang, or a proxy somebody wrote last week. Some
 * support tool calling, some accept the field and ignore it, some answer 400,
 * and there is no way to ask — so the honest answer is no, and whoever knows
 * better says so with the `force` setting. Same for image sizes: whatever was
 * installed accepts whatever it accepts, so nothing is sent and the model
 * decides.
 *
 * The thinking flag is the exception, and it is not a guess: `enable_thinking`
 * is a field these servers ignore when they do not implement it.
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
