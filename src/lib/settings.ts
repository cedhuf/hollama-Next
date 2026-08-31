import type { Locales } from '$i18n/i18n-types';
import { version } from '$app/environment';
import { SYSTEM_SAMPLING_DEFAULTS, type SamplingOptions } from '$lib/chat/options';

import type { LloomaMetadata } from '../routes/api/metadata/+server';
import type { PromptKey } from './defaultPrompts';
import type { KnowledgeCollection } from './knowledge';
import { MCP_LIMITS } from './mcp';

export interface Model {
	serverId: string;
	name: string;
	size?: number;
	parameterSize?: string;
	modifiedAt?: Date;
}

/** A per-model system prompt: extends the global prompt or replaces it entirely. */
export interface ModelSystemPrompt {
	prompt: string;
	mode: 'extend' | 'replace';
}

export interface SystemPrompts {
	global: string;
	perModel: Record<string, ModelSystemPrompt>;
}

/**
 * The effective system prompt for a model, combining the global prompt with the
 * model-specific one (if any):
 *   - 'replace' → the model prompt takes over entirely
 *   - 'extend'  → the model prompt is appended to the global one
 * Returns '' when nothing is configured (the feature stays inert).
 */
export function effectiveSystemPrompt(
	modelName: string | undefined,
	prompts: SystemPrompts | undefined
): string {
	const global = prompts?.global?.trim() ?? '';
	const model = modelName ? prompts?.perModel?.[modelName] : undefined;
	const modelPrompt = model?.prompt?.trim() ?? '';

	if (!modelPrompt) return global;
	if (model?.mode === 'replace') return modelPrompt;
	return [global, modelPrompt].filter(Boolean).join('\n\n');
}

export interface Settings {
	models: Model[];
	lastUsedModels: Model[];
	lastUpdateCheck: number | null;
	/**
	 * Newest version seen by the last successful check.
	 *
	 * Persisted so the About panel can report a result next to the timestamp it
	 * shows, instead of going blank on every reload while claiming a check ran an
	 * hour ago.
	 */
	lastKnownVersion: string;
	autoCheckForUpdates: boolean;
	/** The version already announced by a toast, so it is only announced once. */
	notifiedUpdateVersion: string;
	defaultModel: string | null;
	generateTitlesWithAI: boolean;
	titleModel: string | null;
	/**
	 * Name the conversation again once it has grown into one.
	 *
	 * The first title is written from a single question, before anything has been
	 * answered, so it names the question rather than the conversation. A few
	 * exchanges later there is something to name.
	 *
	 * Once, and only once. A conversation whose name changes every other message is
	 * worse than one badly named: the sidebar stops being somewhere you recognise
	 * things. And never over a title someone typed, which is what `titleEdited` on
	 * the conversation is for.
	 */
	regenerateTitle: boolean;
	/** How many replies before it is named again. */
	regenerateTitleAfter: number;
	/** Model that writes compaction summaries. Empty = the conversation's own model. */
	compactModel: string | null;
	/** The image model the gallery starts on. Empty = the first one available. */
	defaultImageModel: string | null;
	/** Offer to rewrite a description into a fuller image prompt. */
	imagePromptWriter: boolean;
	/**
	 * Name each picture once it is drawn, with the same model that writes prompts.
	 *
	 * On by default, unlike the writer's own switch, because the two cost nothing
	 * alike: a title is a handful of tokens against a request billed by the minute,
	 * and it is what every list of pictures is read by afterwards.
	 */
	imageAutoTitle: boolean;
	/**
	 * The text model that does the rewriting.
	 *
	 * Empty means the default model, like every other model field in the app. An
	 * empty field that silently meant "off" was the odd one out: everywhere else
	 * blank means "whatever you normally use", and a switch is how something is
	 * turned off.
	 */
	imagePromptModel: string | null;
	/**
	 * The sampling settings every conversation starts from.
	 *
	 * A plain set rather than anything cleverer: an absent field is the provider
	 * deciding, which is also what the system defaults say, so there is no third
	 * answer to represent. A conversation lays its own overrides on top of this
	 * and nothing else sits underneath.
	 */
	sampling: SamplingOptions;
	/** Compact on its own once the conversation crosses `compactThreshold`. */
	autoCompact: boolean;
	/**
	 * Tokens at which a conversation counts as full.
	 *
	 * Also the ceiling the load indicator measures against whenever the real one
	 * is unknown, which is most providers, since only Ollama's `num_ctx` is
	 * something the app is told.
	 */
	compactThreshold: number;
	webSearchByDefault: boolean;
	webSearchAuto: boolean;
	/**
	 * Whether the web tools are offered as native tool calls rather than through
	 * the text protocols.
	 *
	 * `off` keeps the `<read>` blocks and the router pre-pass, which work on every
	 * endpoint the app can talk to. `auto` uses native calling wherever it is known
	 * to be supported (Ollama says so per model, the hosted providers all take it)
	 * and falls back to the text path everywhere else. `force` is for a
	 * self-hosted OpenAI-compatible server that supports it without any way to say so.
	 */
	nativeTools: 'off' | 'auto' | 'force';
	/** Read the pages a message links to. Enforced server-side, inside the turn. */
	webFetchEnabled: boolean;
	webFetchByDefault: boolean;
	webFetchMaxPages: number;
	webFetchMaxChars: number;
	/** How many MCP tools may be sent to the model at once, across every server. */
	mcpMaxTools: number;
	searchUrl: string;
	searchBackend: 'degoog' | 'searxng';
	searchToken: string;
	/** Let the model offer interactive quick-choice buttons to clarify a preference. */
	interactiveChoices: boolean;
	/** Prepend the current date/time to each request so the model is anchored in the present. */
	sendCurrentDate: boolean;
	/** Per-instruction overrides of the built-in system prompts (empty = use the default). */
	promptOverrides: Partial<Record<PromptKey, string>>;
	systemPrompts: SystemPrompts;
	/**
	 * Where to read the store, when it is not the public one.
	 *
	 * Empty means `DEFAULT_STORE`. One address for every catalogue under it, so a
	 * closed network mirroring it moves one folder and changes one field. Nothing
	 * else needs to change: every path in every listing is relative to its own
	 * catalogue.
	 */
	storeUrl: string;
	/** How the persona store draws its entries: cards to browse, rows to scan. */
	personaStoreLayout: 'grid' | 'list';
	/**
	 * Take a new revision of an installed persona as soon as one is published.
	 *
	 * Only for the ones you have not touched. A persona you have edited is yours,
	 * and replacing your text because someone upstream changed theirs is not an
	 * update, it is a loss; those keep being offered rather than applied.
	 */
	personaAutoUpdate: boolean;
	/** Take a new revision of an installed playbook, for the ones you have not touched. */
	playbookAutoUpdate: boolean;
	/**
	 * Whether personas called in one message read each other.
	 *
	 * On: they answer in the order they were named, each having read the ones
	 * before, which is what a conversation with several people is. Off: each is
	 * handed the same question and none of the others' answers, which is what you
	 * want when you are collecting independent opinions rather than a discussion.
	 */
	mentionsSequential: boolean;
	/** Named groups of knowledge. Kept here so an empty one survives and no table is needed. */
	knowledgeCollections: KnowledgeCollection[];
	/** Ids of the collections folded shut in the Library, so the page opens as it was left. */
	collapsedCollections: string[];
	// Home screen layout toggles
	homeShowHeader: boolean;
	homeShowSuggestions: boolean;
	homeShowRecentPersonas: boolean;
	homeRecentPersonasCount: number;
	/** A strip of the latest pictures on the home screen, and how many it holds. */
	homeShowRecentImages: boolean;
	homeShowRecentSessions: boolean;
	homeRecentSessionsCount: number;
	/** Show personas you've talked to as pinned launchers in the sidebar. */
	showPinnedPersonas: boolean;
	/**
	 * Draw the sidebar header in its condensed form: New chat on the search row,
	 * the personas as a row of avatars. Off by default, because the full header is
	 * the one that names what its controls do. The shape is settled here and
	 * nowhere else, so nothing about the header answers to the scroll.
	 */
	compactSidebarHeader: boolean;

	/**
	 * Show pin and delete buttons on the rows of the sidebar lists. Off by
	 * default: both live in the right-click menu, where they cannot cover a title
	 * or be hit by accident.
	 */
	showListQuickActions: boolean;
	/**
	 * Draw the conversation's bar as a pill hovering over it rather than as the
	 * column's top edge. On by default: it matches the composer, which floats at the
	 * other end, and the text passing around both is what gives the column depth.
	 * Off puts it back on the edge, where the wallpaper reaches it.
	 */
	floatingChatHeader: boolean;
	/** Tint your own messages with the app's accent so they stand out from replies. */
	accentUserMessages: boolean;
	/** Show the time each message was sent, next to its role badge. */
	showMessageTimestamps: boolean;
	/** Fade the messages a compaction has summarised, so the live context reads apart. */
	fadeCompactedMessages: boolean;
	/** Read attached files (PDF, Word, spreadsheets) into the conversation. */
	documentsEnabled: boolean;
	/** Run OCR on the pictures inside those files. Off: it is slow and fetches an engine. */
	documentOcr: boolean;
	/** Tesseract language code(s) for OCR, e.g. `eng` or `eng+fra`. */
	documentOcrLanguage: string;
	/**
	 * Whether the theme was ever picked here, rather than inherited.
	 *
	 * An instance can hand its users a starting theme they stay free to change, and
	 * that offer has to stop the first time someone chooses. Reading the stored
	 * values cannot tell "never chose" from "chose what the default happened to be".
	 */
	themeChosen: boolean;
	themeMode: 'system' | 'light' | 'dark';
	themeStyle: 'classic' | 'dracula' | 'catppuccin' | 'gruvbox' | 'nord' | 'solarized';
	/**
	 * Whether the app's framing surfaces are translucent at all. Its own switch
	 * rather than the bottom of the slider: turning the effect off is a decision
	 * about legibility and about cost (`backdrop-filter` is paid on every frame
	 * of every scroll) not a taste one, and it deserves to be reachable in one
	 * click. The system's reduced-transparency preference forces it off whatever
	 * this says.
	 */
	surfaceTransparency: boolean;
	/**
	 * Where along the axis, from 0 to 100, with 50 the reference the surfaces are
	 * drawn for and the middle of the track, marked so it can be found again. Low is glass: see-through, barely blurred, the content behind
	 * readable. High is tint: dense and heavily blurred, closer to paint. The two
	 * properties move together because either one alone is unusable: transparency
	 * without blur leaves two texts fighting, blur without transparency shows
	 * nothing.
	 */
	surfaceTransparencyLevel: number;
	/**
	 * How far the wallpaper is blurred, from 0 to 100, with 50 the reference and
	 * the middle of the track.
	 *
	 * Its own axis rather than a share of the transparency one: how much the
	 * surfaces let through and how legible what they let through is are two
	 * questions, and a photograph with a lot going on needs to be softened whether
	 * the panes are glass or paint. At 0 the picture is left as it is, which is a
	 * legitimate answer for a quiet one.
	 */
	backgroundBlurLevel: number;
	/**
	 * Whether the app may offer to install itself, now and then.
	 *
	 * A preference about being asked, so it travels with the rest; when it was
	 * last asked is a fact about one device, and stays there.
	 */
	offerInstall: boolean;
	/**
	 * A picture behind the app, as a data URL. The sidebar's materials let it
	 * through, the conversation stays opaque over it, and the margin around both
	 * shows it plainly.
	 */
	backgroundImage: string;
	userLanguage: Locales | null;
	sidebarExpanded: boolean;
	/**
	 * Send this account to the mobile-first interface under `/m`.
	 *
	 * A setting rather than a breakpoint: the two interfaces are two products, not
	 * one product at two widths, and which one somebody wants is not a thing a media
	 * query can know. It still takes a phone to have any effect at all, so a desktop
	 * never sees `/m` whatever this says.
	 *
	 * On by default now that the phone interface is the better one there. The
	 * setting is stated the other way round in Settings, as switching it off, which
	 * is what a default worth having looks like from the outside: nobody turns on
	 * the thing they were going to get anyway.
	 *
	 * A default only reaches somebody who has never touched it. An account that
	 * explicitly turned this off keeps it off, which is correct and worth knowing
	 * when the change does not appear to have happened.
	 */
	simplifiedMobileUI: boolean;
	/**
	 * Whether the one-time switch to the phone interface has already happened.
	 *
	 * A default only ever reaches somebody who has stored nothing, and this app
	 * persists the whole settings object, so every account that has ever opened it
	 * carries an explicit `simplifiedMobileUI: false` from back when that was the
	 * default. Changing the default alone would therefore have changed it for nobody
	 * who actually uses the app, which is the one group it was meant for.
	 *
	 * Turning a stored `false` into a `true` is normally indefensible: it overrides a
	 * choice. It is defensible exactly once here, because until now the setting was
	 * off by default and buried in Settings, so a stored `false` cannot be somebody
	 * who turned it off. Nobody switches off what they never had. An account that had
	 * switched it *on* is left alone, having actually chosen.
	 *
	 * This flag is what makes it once. Without it the flip would run on every load
	 * and there would be no way to go back to the classic interface at all.
	 */
	mobileDefaultApplied: boolean;
	/**
	 * Speak instead of typing: the composer offers a microphone and what is said is
	 * transcribed before it is sent.
	 *
	 * Off by default, and it has to be: transcription is a second model, on a
	 * connection somebody has to have set up, and a microphone button that fails
	 * the first time it is pressed is worse than no microphone button.
	 */
	voiceInput: boolean;
	/** Which model transcribes. Null means none has been chosen, and the feature waits. */
	voiceModel: string | null;
	/**
	 * Answers read back out loud, which is the other half of speaking to it.
	 *
	 * Its own switch rather than a consequence of `voiceInput`, because the two are
	 * different feelings and different bills. Dictating into a field is a
	 * convenience anybody might want on a desktop; being talked at is a mode, and
	 * on most connections it is a second model again, so it waits to be asked for.
	 */
	speechOutput: boolean;
	/** Which model reads aloud. Null means none has been chosen. */
	speechModel: string | null;
	/**
	 * Which voice it reads in.
	 *
	 * A name the provider knows, and required by every endpoint that does this, so
	 * an empty one is a request that fails rather than one that picks something
	 * sensible. Where the provider publishes its names the picker offers them; where
	 * it does not, this is typed.
	 */
	speechVoice: string;
	/**
	 * How long a silence ends the recording, in milliseconds, on the voice screen.
	 *
	 * A setting rather than a constant because the right value is a fact about the
	 * person and the room, not about the app. Somebody who thinks mid-sentence needs
	 * three seconds; somebody dictating a list is cut off by anything over one. A
	 * number chosen here once was always going to be wrong for half of them.
	 *
	 * The composer's microphone ignores it entirely. It stops when you say so, and a
	 * field that submitted itself because you paused would be a field that fights
	 * you.
	 */
	/**
	 * The language being spoken, as an ISO 639-1 code. Empty means let it work out.
	 *
	 * Dictation only, and that is not an omission. Reading aloud has nowhere to put
	 * it: on Kokoro, Aura and Voxtral the language is part of the voice's own name,
	 * so choosing the voice has already chosen it, and on Gemini and Grok the voices
	 * are timbres rather than languages and the model takes the language from the
	 * text with no field to override it. A setting that reached none of them would
	 * be a control that does nothing on every model anybody uses.
	 */
	voiceLanguage: string;
	/**
	 * Whether the voice screen shows what was said and what is being said back.
	 *
	 * Worth a switch rather than a decision, because the two ways of using that
	 * screen want opposite answers. Reading along catches a question the recogniser
	 * misheard, which is the difference between a bad answer and a bad transcript.
	 * With the phone on the table it is text nobody is looking at, on the one screen
	 * whose whole point is not having to.
	 *
	 * Replaces the silence delay, which was the old loop's only tuning knob and has
	 * no meaning now that ending a turn is the pipeline's own business.
	 */
	voiceTranscript: boolean;
	/**
	 * Whether the voice screen listens again once it has finished answering.
	 *
	 * On, it is a conversation you can hold with the phone on the table. Off, it
	 * reads the answer and stops, and the next question needs a press. Worth being a
	 * choice rather than the design: a microphone that reopens by itself is a
	 * reasonable thing to want switched off, and wanting it off is not the same as
	 * not wanting the feature.
	 */
	voiceAutoContinue: boolean;
	/** Server mode: the new-user welcome tour (app intro, theme, personas) has been seen. */
	welcomeComplete: boolean;
	/**
	 * The last "show everyone the tour again" stamp this browser acknowledged.
	 *
	 * Lets an admin replay the tour for the whole instance, as a release note
	 * nobody can miss, without the server keeping a list of who has seen what.
	 */
	onboardingEpochSeen: number;
	lloomaMetadata: LloomaMetadata;
	profileFirstName: string;
	profileLastName: string;
	profileEmail: string;
	profileAvatar: string;
	profileColor: string;
	/** Automatically expand and collapse reasoning blocks during streaming. */
	autoExpandReasoningBlocks: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
	models: [],
	lastUsedModels: [],
	lastUpdateCheck: null,
	lastKnownVersion: '',
	autoCheckForUpdates: false,
	notifiedUpdateVersion: '',
	defaultModel: null,
	generateTitlesWithAI: false,
	regenerateTitle: false,
	regenerateTitleAfter: 3,
	titleModel: null,
	compactModel: null,
	defaultImageModel: null,
	imagePromptWriter: true,
	imageAutoTitle: true,
	imagePromptModel: null,
	sampling: { ...SYSTEM_SAMPLING_DEFAULTS },
	autoCompact: false,
	compactThreshold: 80000,
	webSearchByDefault: false,
	webSearchAuto: false,
	// Off by default: the text protocols work everywhere and have the mileage, and
	// a small model that calls tools badly fails in ways a user did not ask for.
	nativeTools: 'off',
	webFetchEnabled: true,
	webFetchByDefault: true,
	webFetchMaxPages: 3,
	webFetchMaxChars: 20000,
	mcpMaxTools: MCP_LIMITS.defaultTools,
	searchUrl: '',
	searchBackend: 'degoog',
	searchToken: '',
	interactiveChoices: true,
	sendCurrentDate: true,
	promptOverrides: {},
	systemPrompts: { global: '', perModel: {} },
	storeUrl: '',
	personaStoreLayout: 'grid',
	personaAutoUpdate: false,
	playbookAutoUpdate: false,
	mentionsSequential: true,
	knowledgeCollections: [],
	collapsedCollections: [],
	homeShowHeader: true,
	homeShowSuggestions: true,
	homeShowRecentPersonas: true,
	homeRecentPersonasCount: 3,
	homeShowRecentImages: true,
	homeShowRecentSessions: true,
	homeRecentSessionsCount: 4,
	showPinnedPersonas: true,
	compactSidebarHeader: false,
	showListQuickActions: false,
	floatingChatHeader: true,
	accentUserMessages: true,
	showMessageTimestamps: true,
	fadeCompactedMessages: true,
	documentsEnabled: true,
	documentOcr: false,
	documentOcrLanguage: 'eng',
	themeChosen: false,
	themeMode: 'system',
	themeStyle: 'classic',
	surfaceTransparency: true,
	surfaceTransparencyLevel: 50,
	backgroundBlurLevel: 50,
	offerInstall: true,
	backgroundImage: '',
	userLanguage: null,
	sidebarExpanded: true,
	simplifiedMobileUI: true,
	mobileDefaultApplied: false,
	voiceInput: false,
	voiceModel: null,
	speechOutput: false,
	speechModel: null,
	speechVoice: '',
	voiceLanguage: '',
	voiceTranscript: true,
	voiceAutoContinue: true,
	welcomeComplete: false,
	onboardingEpochSeen: 0,
	lloomaMetadata: { currentVersion: version },
	profileFirstName: '',
	profileLastName: '',
	profileEmail: '',
	profileAvatar: '',
	profileColor: '#6366f1',
	autoExpandReasoningBlocks: false
};
