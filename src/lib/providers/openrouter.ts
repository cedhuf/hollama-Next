import type { ProviderDescriptor } from './types';

/**
 * OpenRouter.
 *
 * One key, one address, and several hundred models from every vendor behind it,
 * which is what makes it the cheapest way to try something before deciding
 * whether to host it. Speaking the OpenAI wire format throughout, including the
 * audio routes, so nothing here has to describe how to reach them.
 *
 * No `modelFilter`, unlike OpenAI's entry: there is no prefix that means
 * anything across a catalogue this wide, and the connection form has a filter
 * field for whoever wants one. A catalogue of five hundred entries is exactly
 * what the model picker's search is for.
 *
 * No `imageGeneration` either, and that is not an oversight. They serve image
 * models, but through their own chat-shaped route rather than
 * `/images/generations`, and a descriptor that claimed the capability would
 * offer a page that fails on every press. Left off, drawing is simply not
 * offered here.
 *
 * Sound is the one place they need telling, and twice. `/audio/transcriptions`
 * is the ordinary OpenAI route and needs no `transcription` block, but the models
 * that answer it are invisible from the main catalogue: four hundred entries, and
 * the only thing in them with speech in its name is a chat model that happens to
 * listen. Reading aloud is a route the app has no default for at all. Both are
 * declared below, and both catalogues come back saying what they hold, so nothing
 * here rests on reading a name.
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
	// ones that support it and harmless for the ones that do not: the app asks the
	// endpoint before assuming, exactly as it does elsewhere.
	nativeTools: true,
	/**
	 * They will say what a call cost, which here is the only thing that can be
	 * right.
	 *
	 * One model does not have one price on this connection. They route to whichever
	 * upstream provider they choose and bill at that provider's rate:
	 * `openai/whisper-large-v3` is 0.0000075 through DeepInfra and 0.0015 through
	 * Together, a factor of two hundred, decided per request and after the fact. No
	 * figure typed into Models and prices can be right about that. The one in the
	 * answer is.
	 */
	// Credits, which are dollars: their pricing, their invoices and this figure all
	// use the same unit, and nothing anywhere in this app converts one to another.
	reportsCost: { currency: 'USD' },
	/**
	 * And for the route that answers with sound rather than with JSON, where to go
	 * back and ask.
	 *
	 * `total_cost` is their field. A figure that is not there hands the question
	 * back to the price table rather than becoming a zero, which is the difference
	 * between an unmetered call and a call recorded as free.
	 */
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
	 * What hears, and what talks.
	 *
	 * Their own filters, asked as two more questions rather than transcribed into
	 * lists here, so a model added next week arrives on the next sync instead of on
	 * the next release. Neither is guessable from the main list: nineteen
	 * transcription models and eighteen speaking ones, and not one of them among
	 * the four hundred entries `/models` returns.
	 *
	 * And guessing would not save it. `fish-audio/transcribe-1` listens while
	 * `fish-audio/s1` talks, and no substring separates those two. The question
	 * does, which is why the kind is declared here and not left to the names.
	 */
	catalogues: ({ baseUrl }) => [
		{ url: `${baseUrl}/models?output_modalities=transcription`, kind: 'audio' },
		{ url: `${baseUrl}/models?output_modalities=speech`, kind: 'speech' }
	],
	/**
	 * Dictation.
	 *
	 * The ordinary route in the ordinary place, so no `url`. The whole of this
	 * block is one field: their multipart form takes `language`, and saying it is
	 * the difference between a recogniser that is reliable on a sentence and one
	 * that guesses on three words.
	 */
	transcription: { language: 'language' },
	/**
	 * Reading aloud.
	 *
	 * The plain OpenAI shape, `{ model, input, voice }` in and audio bytes out, so
	 * only the address needs saying. Every one of the eighteen requires a voice,
	 * and the catalogue publishes each model's own list under `supported_voices`,
	 * which is the same list the app would otherwise ask somebody to copy out of a
	 * documentation page.
	 *
	 * The voices are read from the speaking catalogue rather than from the
	 * per-model endpoint: it is one request for every model at once, it is the
	 * request the sync already makes, and it answers without a key.
	 */
	speech: {
		url: ({ baseUrl }) => `${baseUrl}/audio/speech`,
		// Their default is `pcm`, which is raw samples with no rate to assemble them
		// by. Named here so the app asks for the one it can actually play.
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
