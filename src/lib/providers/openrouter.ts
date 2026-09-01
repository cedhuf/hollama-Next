import type { ProviderDescriptor } from './types';

/**
 * OpenRouter: one key, one address, and several hundred models from every vendor
 * behind it. The OpenAI wire format throughout, audio routes included.
 *
 * No `modelFilter`, unlike OpenAI's entry: no prefix means anything across a
 * catalogue this wide, and the form has a filter field for whoever wants one.
 *
 * No `imageGeneration` either: they serve image models through their own
 * chat-shaped route rather than `/images/generations`, so claiming the
 * capability would offer a page that fails on every press.
 *
 * Sound needs telling twice. `/audio/transcriptions` is the ordinary route, but
 * the models that answer it are invisible from the main catalogue, and reading
 * aloud is a route the app has no default for. Both catalogues come back saying
 * what they hold, so nothing here rests on reading a name.
 */
export const openrouter: ProviderDescriptor = {
	id: 'openrouter',
	name: 'OpenRouter',
	family: 'openai',
	identified: true,
	baseUrl: 'https://openrouter.ai/api/v1',
	requiresApiKey: true,
	apiKeyHelpUrl: 'https://openrouter.ai/keys',
	badge: { id: 'openrouter', color: '#6B7280' },
	// Passed through to whichever model is behind the name, so it is true of the
	// ones that support it and harmless for the rest: the app asks the endpoint.
	nativeTools: true,
	/**
	 * They will say what a call cost, which here is the only thing that can be
	 * right: one model does not have one price. `openai/whisper-large-v3` is
	 * 0.0000075 through DeepInfra and 0.0015 through Together, decided per request.
	 *
	 * Credits are dollars, and nothing in this app converts one currency to another.
	 */
	reportsCost: { currency: 'USD' },
	/** For the route that answers with sound rather than JSON. `total_cost` is their field; absent hands the question back to the price table rather than becoming a zero. */
	costLookup: {
		header: 'x-generation-id',
		url: ({ baseUrl }, id) => `${baseUrl}/generation?id=${encodeURIComponent(id)}`,
		read: (body) => {
			const data = (body as { data?: Record<string, unknown> })?.data ?? body;
			const found = (data as Record<string, unknown>)?.total_cost;
			return typeof found === 'number' ? found : undefined;
		}
	},
	/**
	 * What hears, and what talks: their own filters, asked as two more questions
	 * rather than transcribed into lists here, so a model added next week arrives on
	 * the next sync. Neither is in the four hundred entries `/models` returns.
	 *
	 * Guessing would not save it either: `fish-audio/transcribe-1` listens while
	 * `fish-audio/s1` talks, and no substring separates the two.
	 */
	catalogues: ({ baseUrl }) => [
		{ url: `${baseUrl}/models?output_modalities=transcription`, kind: 'audio' },
		{ url: `${baseUrl}/models?output_modalities=speech`, kind: 'speech' }
	],
	/** The ordinary route in the ordinary place, so no `url`. The whole block is one field: their form takes `language`, which is the difference between a recogniser reliable on a sentence and one guessing on three words. */
	transcription: { language: 'language' },
	/**
	 * Reading aloud, in the plain OpenAI shape, so only the address needs saying.
	 * Every one of the eighteen requires a voice, and the catalogue publishes each
	 * model's own list under `supported_voices`.
	 *
	 * Read from the speaking catalogue rather than the per-model endpoint: one
	 * request for every model at once, the one the sync already makes, and it
	 * answers without a key.
	 */
	speech: {
		url: ({ baseUrl }) => `${baseUrl}/audio/speech`,
		// Their default is `pcm`, raw samples with no rate to assemble them by.
		formats: ['mp3', 'pcm'],
		voices: {
			url: ({ baseUrl }) => `${baseUrl}/models?output_modalities=speech`,
			read: (body, model) => {
				const entries = (body as { data?: { id?: string; supported_voices?: unknown }[] })?.data;
				const found = entries?.find((entry) => entry?.id === model)?.supported_voices;
				return Array.isArray(found) ? found.filter((voice) => typeof voice === 'string') : [];
			}
		}
	}
};
