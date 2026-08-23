/**
 * What the app knows about one provider, in one place.
 *
 * These facts change on somebody else's schedule. A provider renames an
 * endpoint, adds an image model with different sizes, starts accepting tool
 * calls: none of that is a change to this application, and none of it should
 * mean reading its code. So it is data, kept per provider in a file of its own,
 * and everything the app asks about a provider is answered from here.
 *
 * TypeScript rather than JSON, for two reasons that both turned out to matter.
 * Some of it is not data: Infomaniak's endpoints are *derived* from a product
 * id, which a JSON file cannot express. And a descriptor that satisfies an
 * interface is checked by the compiler, where a JSON file would need a validator
 * written and maintained beside it.
 *
 * Compiled in, not fetched. If these ever need to change without a release, the
 * store already has the plumbing for catalogues that live outside the app, and
 * that is the door to use rather than a second one.
 *
 * The list is a convenience, never a gate. A provider nobody has described is
 * not refused: it goes through the OpenAI-compatible entry and loses only the
 * conveniences, which is what makes a wrong descriptor a degradation rather than
 * a lockout, and what makes this folder safe to accept changes to.
 */

/** How a picture is asked for, in the app's words rather than any provider's. */
export type ImageRatio = 'square' | 'portrait' | 'landscape';
export const IMAGE_RATIOS: ImageRatio[] = ['square', 'portrait', 'landscape'];

export type ImageQuality = 'low' | 'standard' | 'high';
export const IMAGE_QUALITIES: ImageQuality[] = ['low', 'standard', 'high'];

/**
 * What a provider calls a shape and a level of effort.
 *
 * Absent means the app has nothing to say, and the request then carries neither
 * field: every endpoint has a default, and omitting is valid everywhere where
 * guessing is a refusal that arrives after the wait.
 */
export interface ImageOptions {
	sizes?: Record<ImageRatio, string>;
	qualities?: Record<ImageQuality, string>;
}

/**
 * A rule about model names, not an entry about one model.
 *
 * The difference is the whole reason this stays small. One provider can serve
 * several image models that disagree (on OpenAI a portrait is 1024x1536 for
 * `gpt-image-1` and 1024x1792 for `dall-e-3`) but families share behaviour, so
 * a handful of substrings covers what an enumerated catalogue would chase for
 * ever. First match wins; nothing matching falls back to the provider's own
 * defaults, and failing those, to sending nothing.
 */
export interface ModelRule {
	/** Matched against the lowercased model id. */
	matches: string[];
	images?: ImageOptions;
	/**
	 * Reference pictures this family accepts, when it accepts any.
	 *
	 * Per model rather than per provider, because within one provider it varies:
	 * `gpt-image-1` takes sixteen, `dall-e-3` takes none at all. Leaving it off is
	 * saying no, which is the answer that costs a disabled control rather than a
	 * refusal arriving after the wait.
	 */
	references?: ReferenceImages;
}

/**
 * How a provider takes pictures you hand it, rather than only a description.
 *
 * Both providers described here want multipart, with the pictures repeated in
 * one field. They disagree about its name, and about whether a model is named
 * beside them: OpenAI edits a picture *with* a model, while Infomaniak's portrait
 * route has none at all, because there the endpoint is the model.
 *
 * There is deliberately no encoding to choose. Their specification announces
 * JSON with base64 strings, and it is wrong: the endpoint answers
 * `images.0 must be a file`. So one shape until something genuinely differs,
 * rather than a switch designed from two samples and a misreading.
 *
 * What is deliberately *not* here: `response_format`, the accepted types and the
 * size limits. Those are not vocabulary, they are the defences: asking for a
 * URL instead of base64 would have the app fetch a host the provider named, from
 * inside its own network. A descriptor may describe. It may never weaken a rule.
 */
export interface ReferenceImages {
	/** At most this many pictures, from the provider's own documentation. */
	max: number;
	/** The form field carrying them, repeated once per picture. */
	field: string;
	/**
	 * Whether a model is named beside the pictures.
	 *
	 * A route of its own is not a model anywhere, so naming one is a field it does
	 * not know. Off by default, because that is the case a descriptor has to think
	 * about; a general endpoint says so.
	 */
	sendsModel?: boolean;
	/**
	 * A word the prompt must contain for the pictures to be used.
	 *
	 * Some endpoints inject the likeness at a place the prompt names rather than
	 * at the start of it, so the word is how they are told where. Missing, the
	 * request is refused outright: after the wait, and after the meter has run.
	 *
	 * The token only. What to say about it is the application's, translated with
	 * everything else, because a descriptor holds vocabulary and never wording.
	 */
	trigger?: string;
	/** The endpoint, built from whichever of the connection's two roots it needs. */
	url: (roots: { baseUrl: string; imageBaseUrl: string }) => string;
}

export interface ProviderDescriptor {
	/** The stored `connectionType`. Also the file's name. */
	id: string;
	/** Display name. A proper noun, so never translated. */
	name: string;
	/** Which chat strategy talks to it. */
	family: 'ollama' | 'openai';
	/**
	 * Whether the endpoint is the provider's to decide.
	 *
	 * Identified providers have one known address, so the form asks for a key and
	 * hides the URL under Advanced. The others put it front and centre, because
	 * it is the only thing that identifies them.
	 */
	identified: boolean;
	baseUrl: string;
	/**
	 * For a provider whose endpoint is one fixed string bar a single value.
	 *
	 * The form then asks for that value instead of the URL, and builds the URL
	 * from it. Asking for the whole address with a placeholder still in it is what
	 * this replaced, and it sent the placeholder to the API the first time anybody
	 * missed it.
	 *
	 * A new connection of this kind starts with a blank base URL rather than the
	 * template, which is what stops it being synced before it can work.
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

	/** What this provider calls a shape and a quality, before any model rule. */
	images?: ImageOptions;
	/** Reference pictures, for a provider where every image model agrees. */
	references?: ReferenceImages;
	/**
	 * Models this provider serves that its catalogue does not list.
	 *
	 * A dedicated endpoint has no entry in `/models`, because it is not a model
	 * there. It is a route. Naming it here gives it one, and from that point on
	 * it is priced, shared, refused and metered by exactly the machinery every
	 * other model goes through, rather than by a second path written beside it.
	 */
	extraModels?: string[];
	/** Refinements for the model families that disagree with the line above. */
	modelRules?: ModelRule[];

	/**
	 * Where the image endpoints live, when that is not where the chat endpoint
	 * lives, derived from the chat URL. Infomaniak is the case in hand: chat on
	 * API version 2 under `/openai/v1`, images only on version 1 under `/openai`,
	 * and no path appended to the first reaches the second.
	 */
	imageBaseFrom?: (baseUrl: string) => string;
}
