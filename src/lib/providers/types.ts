/**
 * What the app knows about one provider, as data rather than as code, one file
 * per provider.
 *
 * TypeScript rather than JSON because some of it is derived (Infomaniak builds
 * its endpoints from a product id) and because the compiler checks it.
 *
 * The list is a convenience, never a gate: a provider nobody has described goes
 * through the OpenAI-compatible entry and loses only the conveniences.
 */

/**
 * What a model does, which is what every picker is really asking.
 *
 * Embeddings are here to be recognised and left out: one in the chat picker is a
 * 400 with no explanation. `audio` hears and `speech` talks, and they are two
 * kinds because one list would put Whisper in the read-aloud picker. Rerankers
 * fold in with embeddings, since neither is ever offered.
 */
export type ModelKind = 'text' | 'image' | 'embedding' | 'audio' | 'speech';

export const MODEL_KINDS: ModelKind[] = ['text', 'image', 'embedding', 'audio', 'speech'];

/** How a picture is asked for, in the app's words rather than any provider's. */
export type ImageRatio = 'square' | 'portrait' | 'landscape';
export const IMAGE_RATIOS: ImageRatio[] = ['square', 'portrait', 'landscape'];

export type ImageQuality = 'low' | 'standard' | 'high';
export const IMAGE_QUALITIES: ImageQuality[] = ['low', 'standard', 'high'];

/** Absent means the app says nothing and the request carries neither field: every endpoint has a default. */
export interface ImageOptions {
	sizes?: Record<ImageRatio, string>;
	qualities?: Record<ImageQuality, string>;
}

/**
 * A rule about model names, not an entry per model: families share behaviour, so
 * a handful of substrings covers what an enumerated catalogue would chase for
 * ever. First match wins.
 */
export interface ModelRule {
	/** Matched against the lowercased model id. */
	matches: string[];
	images?: ImageOptions;
	/** Per model, not per provider: `gpt-image-1` takes sixteen, `dall-e-3` none. Absent means no. */
	references?: ReferenceImages;
}

/**
 * How a provider takes pictures you hand it. Multipart, with the pictures
 * repeated in one field: their specification announces JSON with base64 and the
 * endpoint answers `images.0 must be a file`.
 */
/**
 * How a provider turns speech into words. Absent, the OpenAI contract is
 * assumed: multipart to `/audio/transcriptions` on the connection's own root.
 * Present, a provider departs from it.
 *
 * Deliberately not here: size ceilings, accepted types, and how long the app
 * waits. Those are defences, and they are the app's.
 */
export interface Transcription {
	/** Absent means the usual place, `/audio/transcriptions` off the connection's own root. */
	url?: (roots: { baseUrl: string }) => string;
	/**
	 * The form field carrying the spoken language, where the endpoint takes one.
	 *
	 * Opt-in: it is an extra multipart field, and an endpoint that does not know it
	 * may refuse the whole upload. Worth it, since detection guesses on the three
	 * words most people say to a phone, and costs a pass of its own.
	 */
	language?: string;
	/**
	 * For a provider that hands back a receipt instead of the words. `read` says
	 * whether an answer is finished; when to stop asking is a defence, and the app's.
	 */
	poll?: {
		url: (roots: { baseUrl: string }, accepted: unknown) => string;
		/**
		 * `done` with the words, `failed` when the job never will, neither while it
		 * runs. An unrecognised shape reads as still running, since calling it a failure
		 * throws away what somebody said.
		 */
		read: (body: unknown) => { done: boolean; text?: string; failed?: string };
	};
}

export interface ReferenceImages {
	/** At most this many pictures, from the provider's own documentation. */
	max: number;
	/** The form field carrying them, repeated once per picture. */
	field: string;
	/** A route of its own is not a model anywhere, so naming one is a field it does not know. Off by default. */
	sendsModel?: boolean;
	/**
	 * A word the prompt must contain for the pictures to be used: some endpoints
	 * inject the likeness where the prompt names it. Missing, the request is refused
	 * after the wait. The token only, never the wording, which is translated.
	 */
	trigger?: string;
	/** The endpoint, built from whichever of the connection's two roots it needs. */
	url: (roots: { baseUrl: string; imageBaseUrl: string }) => string;
}

/**
 * One more list of models. `kind` is why this is a shape rather than a URL: a
 * provider that has answered what it serves should not be second-guessed by a
 * substring. Never above somebody's correction in Models and prices.
 */
export interface Catalogue {
	url: string;
	/** What everything in this list is, when the question settles it. */
	kind?: ModelKind;
}

/**
 * How a provider reads a sentence out loud. Absent means it does not, and the
 * feature is not offered: an invented route 404s on every press.
 *
 * `voices` makes the choice a list rather than a spelling test, since every one
 * of these endpoints refuses a request with no voice named.
 *
 * Deliberately not here: text limits, timeouts, and what the app will play.
 */
export interface Speech {
	/** Where the sentence goes, built from the connection's roots. */
	url: (roots: { baseUrl: string }) => string;
	/**
	 * What this provider returns, best first. Not a preference: OpenRouter defaults
	 * to `pcm`, raw samples with no sample rate to assemble them by, which a browser
	 * cannot play. Absent means `mp3`. The app takes the first one it can render.
	 */
	formats?: string[];
	/** `read` pulls the model's voice names out of the answer. Absent, the app asks for a name instead. */
	voices?: {
		url: (roots: { baseUrl: string }) => string;
		read: (body: unknown, model: string) => string[];
	};
}

export interface ProviderDescriptor {
	/** The stored `connectionType`. Also the file's name. */
	id: string;
	/** Display name. A proper noun, so never translated. */
	name: string;
	/** Which chat strategy talks to it. */
	family: 'ollama' | 'openai';
	/** Identified providers have one known address, so the form asks for a key and hides the URL. */
	identified: boolean;
	baseUrl: string;
	/**
	 * For a provider whose endpoint is one fixed string bar a single value: the form
	 * asks for that value and builds the URL. A new connection starts with a blank
	 * base URL, so it is not synced before it can work.
	 */
	urlField?: {
		/** i18n key for the label, so the wording stays with the other wording. */
		label: string;
		placeholder: string;
		toBaseUrl: (value: string) => string;
		fromBaseUrl: (baseUrl: string) => string;
	};
	modelFilter?: string;
	requiresApiKey: boolean;
	apiKeyHelpUrl?: string;
	/** Badge colour and short id, dark-mode safe. */
	badge: { id: string; color: string };

	/** Known to accept a `tools` array. */
	nativeTools?: boolean;
	/** Takes the explicit `chat_template_kwargs.enable_thinking` flag. */
	thinkingRequest?: boolean;
	/** Has its own native thinking, rather than the request flag. */
	nativeThinking?: boolean;
	/** Serves an image endpoint at all. */
	imageGeneration?: boolean;
	/**
	 * Says what each call cost, in the answer's `usage` block. Nothing is asked for
	 * it and reading it needs no declaration.
	 *
	 * The flag is for what the app decides *before* a call: no price form, and an
	 * exemption from the rule refusing an unpriced model under an allowance.
	 *
	 * The currency is not decoration: with no price table there is nowhere else to
	 * learn what an allowance of `20` is counted in.
	 */
	reportsCost?: { currency: string };
	/**
	 * Where to ask afterwards what one call cost, for a route that answers with
	 * bytes: synthesis has nowhere to put a usage block, but carries an identifier
	 * in a header. Absent means such a route goes uncounted unless the table covers it.
	 */
	costLookup?: {
		/** The response header carrying the identifier. */
		header: string;
		url: (roots: { baseUrl: string }, id: string) => string;
		/** The figure, in the provider's own currency, or nothing if it is not there. */
		read: (body: unknown) => number | undefined;
	};

	/** What this provider calls a shape and a quality, before any model rule. */
	images?: ImageOptions;
	/** Reference pictures, for a provider where every image model agrees. */
	references?: ReferenceImages;
	/** How this provider transcribes, when it does not do it the usual way. */
	transcription?: Transcription;
	/** How this provider reads aloud, when it does that at all. */
	speech?: Speech;
	/**
	 * Models the catalogue does not list, because they are routes rather than models
	 * there. Naming one gives it an entry, so it is priced, shared, refused and
	 * metered by the same machinery as everything else.
	 */
	extraModels?: string[];
	/**
	 * Further catalogues to ask for, when one list is not the whole list:
	 * OpenRouter's `/models` returns four hundred entries with no transcription
	 * model among them.
	 *
	 * A URL each rather than a list of names, so the answer stays the provider's.
	 * Read like the main one and merged into it, but a question this narrow says
	 * what it holds, and that beats the name.
	 */
	catalogues?: (roots: { baseUrl: string }) => Catalogue[];
	/** Refinements for the model families that disagree with the line above. */
	modelRules?: ModelRule[];

	/**
	 * Where the image endpoints live when that is not where chat lives. Infomaniak:
	 * chat on v2 under `/openai/v1`, images on v1 under `/openai`.
	 */
	imageBaseFrom?: (baseUrl: string) => string;
}
