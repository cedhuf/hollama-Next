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

/**
 * What a model does, which is the question every picker in the app is really
 * asking.
 *
 * Five, because a provider's catalogue holds five sorts of thing and only three
 * are offered anywhere: something you hold a conversation with, something that
 * draws, something that returns a vector, something that turns speech into text
 * and something that turns text into speech. The embeddings are here to be
 * recognised and left out. An embedding model in the chat picker is not a
 * cosmetic problem, it is a 400 with no explanation.
 *
 * `audio` and `speech` are two kinds and not one on purpose, and the distinction
 * is the whole reason there are five. Both are sound, and they run in opposite
 * directions: `audio` hears, `speech` talks. One list would put Kokoro in the
 * dictation picker, where it answers 400 to a recording, and Whisper in the
 * reading-aloud picker, where it answers 400 to a sentence. Naming the direction
 * is what stops both.
 *
 * Infomaniak's own catalogue declares `llm`, `image`, `embedding`, `reranker`
 * and `stt`. Rerankers fold in with embeddings here: both are retrieval-side,
 * neither is ever offered, and inventing a section for a category the app will
 * never call would be describing the provider rather than the app.
 *
 * It lives here rather than beside the connections because a catalogue can
 * declare it. A provider that will say what it serves is worth more than any
 * guess made from a name, and saying it means naming one of these.
 */
export type ModelKind = 'text' | 'image' | 'embedding' | 'audio' | 'speech';

export const MODEL_KINDS: ModelKind[] = ['text', 'image', 'embedding', 'audio', 'speech'];

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
/**
 * How a provider turns speech into words.
 *
 * Absent, the OpenAI contract is assumed: multipart to `/audio/transcriptions`
 * on the connection's own root, and the text comes back in the answer. That is
 * what every compatible endpoint does and it needs saying nowhere.
 *
 * Present, a provider is saying something the default does not cover, and there
 * are three things it can be. The route may hang off a different root than chat
 * does, which is Infomaniak's case for the second time (their catalogue is on one
 * API version and half their routes on another). The route may be asynchronous:
 * it answers with a handle and the words arrive later, from somewhere else. Or
 * the endpoint may take more than the audio, which is what `language` is for.
 *
 * What is deliberately *not* here: the size ceiling, the accepted audio types,
 * how long the app is willing to wait and how often it asks. Those are the
 * defences, and they are the app's. A descriptor says where to knock and how to
 * read the answer. It may never say how patient to be.
 */
export interface Transcription {
	/**
	 * Where the audio goes, built from the connection's roots.
	 *
	 * Absent means the usual place, `/audio/transcriptions` off the connection's
	 * own root. That is what makes this block sayable by a provider that follows
	 * the contract in every respect but one, rather than only by a provider that
	 * departs from it wholesale.
	 */
	url?: (roots: { baseUrl: string }) => string;
	/**
	 * The form field carrying the spoken language, where the endpoint takes one.
	 *
	 * Named rather than assumed, and opt-in rather than universal, because it is
	 * sent as an extra multipart field and an endpoint that does not know it is
	 * within its rights to refuse the whole upload. Every implementation of the
	 * OpenAI contract calls it `language` and takes an ISO 639-1 code.
	 *
	 * It is worth the trouble. Left to detect on its own, a recogniser is reliable
	 * on a full sentence and guesses on three words, and three words is most of
	 * what anybody says to a phone. Saying the language outright also gets the
	 * answer back sooner, since detection is a pass of its own.
	 */
	language?: string;
	/**
	 * For a provider that hands back a receipt instead of the words.
	 *
	 * `url` reads the accepted response and says where to ask again. `read` is
	 * given each answer and says whether it is finished, and with what. Neither
	 * decides when to stop asking: that is a defence, and it lives in the app.
	 */
	poll?: {
		url: (roots: { baseUrl: string }, accepted: unknown) => string;
		/**
		 * `done` with the words when they are there, `failed` when the job says it
		 * will never produce any, and neither while it is still running. A shape
		 * nobody recognises reads as "still running", because the alternative is
		 * calling an unfamiliar answer a failure and throwing away what somebody
		 * said. That is what the app's ceiling is for.
		 */
		read: (body: unknown) => { done: boolean; text?: string; failed?: string };
	};
}

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

/**
 * One more list of models, and what asking for it establishes.
 *
 * `kind` is the reason this is a shape rather than a bare URL. Sorting a model
 * by its name is a guess the app makes because nothing better is on offer, and
 * here something better is: a provider asked what it serves that speaks has
 * answered, and that answer should not then be second-guessed by a substring.
 * Leave it off for a list that establishes nothing, and the names decide as
 * usual.
 *
 * Never above somebody's correction, though. Whoever runs the instance still has
 * the last word, in Models and prices, over the provider as much as over the
 * guess.
 */
export interface Catalogue {
	url: string;
	/** What everything in this list is, when the question settles it. */
	kind?: ModelKind;
}

/**
 * How a provider reads a sentence out loud.
 *
 * Absent means it does not, and reading aloud is simply not offered on that
 * connection. There is no assumed contract here, unlike transcription: an
 * endpoint that does not synthesise answers 404 to a route the app invented, and
 * a speaker button that fails on every press is worse than no speaker button.
 *
 * `voices` is what makes the choice a list rather than a spelling test. Every
 * one of these endpoints requires a voice by name and refuses the request
 * without one, so a provider that publishes its own names should be asked for
 * them rather than have them typed from its documentation.
 *
 * What is deliberately *not* here: how much text may be sent at once, how long
 * the app waits, and what it will play. Those are the defences, and they are the
 * app's.
 */
export interface Speech {
	/** Where the sentence goes, built from the connection's roots. */
	url: (roots: { baseUrl: string }) => string;
	/**
	 * What this provider will return, in the order the app should prefer.
	 *
	 * It matters more than it looks. These routes do not agree on a default, and
	 * OpenRouter's is `pcm`: raw samples, with no sample rate in the answer to
	 * assemble them by, which a browser cannot play from a blob. Asking for
	 * something playable is therefore not a preference, it is the difference
	 * between sound and a failure.
	 *
	 * Absent means `mp3`, which is what the OpenAI contract specifies and what
	 * every implementation of it produces. A provider that serves something else
	 * says so here, first choice first, and the app takes the first one it can
	 * play rather than the first one listed: a descriptor may describe what is on
	 * offer, it may not tell the app to accept bytes it has no way to render.
	 */
	formats?: string[];
	/**
	 * The voices one model offers, when the provider will say.
	 *
	 * `url` is asked with the connection's key, and `read` pulls the names for
	 * the model out of whatever comes back. Absent, the app has no list to offer
	 * and asks for a name instead, which is the honest fallback rather than a
	 * short list of guesses that happen to work on one provider.
	 */
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
	/**
	 * Says what each call actually cost, in the answer.
	 *
	 * Nothing has to be asked for it: the figure rides in the `usage` block the
	 * app already requests for its token counts, on a stream as much as off one.
	 * Reading it needs no declaration either, and none is made: a body carrying
	 * `usage.cost` is believed whoever sent it.
	 *
	 * What this flag is for is everything the app decides *before* a call. It stops
	 * Models and prices offering a form for a figure that would never be read, and
	 * it exempts the connection from the rule that refuses an unpriced model while
	 * an allowance is in force, since that rule exists because uncounted means
	 * unlimited and nothing here goes uncounted.
	 *
	 * It matters most where the app is least able to guess. A gateway routes each
	 * request to whichever upstream provider it picks, at that provider's rate, so
	 * one model genuinely has several prices, and the table the app keeps per
	 * connection is not approximately wrong there, it is structurally wrong. Two
	 * measured calls make the point: on OpenRouter, Kokoro is billed per character
	 * and Whisper per second of audio, and the catalogue calls the figure `prompt`
	 * in both cases without ever saying which.
	 *
	 * The currency is not decoration. Once a connection needs no prices in the
	 * table, the table is empty, and the only other place the app ever learned what
	 * currency it was counting in was that table. Without this, an allowance renders
	 * as a bare `20`, which is worse than no figure: a ceiling whose unit is a guess
	 * is a ceiling nobody can act on.
	 */
	reportsCost?: { currency: string };
	/**
	 * Where to ask afterwards what one call cost, for a route that answers with
	 * bytes.
	 *
	 * Synthesis has nowhere to put a usage block: the answer is the audio. What it
	 * does carry is an identifier in a header, and the provider will say what that
	 * generation cost if asked again. So the app asks, in the background, once the
	 * sound is already on its way to whoever is waiting for it.
	 *
	 * Absent means a route of that shape goes uncounted unless the price table
	 * covers it, which is the honest outcome rather than an invented figure.
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
	 * Models this provider serves that its catalogue does not list.
	 *
	 * A dedicated endpoint has no entry in `/models`, because it is not a model
	 * there. It is a route. Naming it here gives it one, and from that point on
	 * it is priced, shared, refused and metered by exactly the machinery every
	 * other model goes through, rather than by a second path written beside it.
	 */
	extraModels?: string[];
	/**
	 * Further catalogues to ask for, when one list is not the whole list.
	 *
	 * Not the same problem as `extraModels`, though it looks adjacent. There, a
	 * route is not a model anywhere and has to be named by hand. Here the provider
	 * knows perfectly well what it serves and will say so, but only if asked the
	 * right question: OpenRouter's `/models` returns four hundred entries with not
	 * one transcription model among them, and the nineteen that do exist come back
	 * only from `?output_modalities=transcription`.
	 *
	 * A URL each rather than a list of names, so the answer stays the provider's.
	 * A hand-written list of speech models would be stale by the end of the month,
	 * which is the thing this folder keeps saying and the reason it is worth one
	 * more field.
	 *
	 * Each is read exactly like the main one: the OpenAI `{ data: [{ id }] }`
	 * shape, the connection's key, the connection's filter, and the results merged
	 * into one catalogue.
	 *
	 * Unlike the main one, a list asked this narrowly can say what it holds. A
	 * question of the form "what transcribes" comes back with things that
	 * transcribe, and that is the provider's own answer rather than the app's guess
	 * at one. Where it is given, it beats the name: no reading of `fish-audio/s1`
	 * will ever reveal that it talks.
	 */
	catalogues?: (roots: { baseUrl: string }) => Catalogue[];
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
