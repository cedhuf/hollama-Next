import type { ProviderDescriptor } from './types';

/**
 * Ollama, running on somebody's own machine.
 *
 * The only provider here that is not reached over the internet, which decides
 * most of what follows: no key, an address that is whoever's machine it is, and
 * a chat protocol of its own rather than OpenAI's.
 *
 * It reports per model whether it can call tools, so `nativeTools` is left off:
 * the answer is not a fact about Ollama, it is a fact about the model, and the
 * app asks the endpoint instead of assuming here.
 */
export const ollama: ProviderDescriptor = {
	id: 'ollama',
	name: 'Ollama',
	family: 'ollama',
	identified: false,
	baseUrl: 'http://localhost:11434',
	requiresApiKey: false,
	badge: { id: 'ollama', color: '#1D9E75' },
	nativeThinking: true
};
