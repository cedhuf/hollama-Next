import type { Locales } from '$i18n/i18n-types';
import { version } from '$app/environment';

import type { LloomaMetadata } from '../routes/api/metadata/+server';
import type { PromptKey } from './defaultPrompts';
import type { KnowledgeCollection } from './knowledge';

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
	/** Model that writes compaction summaries. Empty = the conversation's own model. */
	compactModel: string | null;
	/** Compact on its own once the conversation crosses `compactThreshold`. */
	autoCompact: boolean;
	/**
	 * Tokens at which a conversation counts as full.
	 *
	 * Also the ceiling the load indicator measures against whenever the real one
	 * is unknown — which is most providers, since only Ollama's `num_ctx` is
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
	 * to be supported — Ollama says so per model, the hosted providers all take it —
	 * and falls back to the text path everywhere else. `force` is for a
	 * self-hosted OpenAI-compatible server that supports it without any way to say so.
	 */
	nativeTools: 'off' | 'auto' | 'force';
	/**
	 * Run a turn in the server rather than in this tab.
	 *
	 * On by default, because the alternative loses answers: a generation that
	 * lives in the page dies with it, and a reload, a navigation or iOS reclaiming
	 * a backgrounded tab all count. Run in the server it survives all three, and a
	 * tab that comes back reattaches to it.
	 *
	 * The trade is worth stating plainly, and it is the reason this is a setting
	 * at all rather than simply how the app works: in local mode the conversation
	 * then passes through the llooma server on its way to the model, where talking
	 * to Ollama straight from the browser never touched it. That server is the
	 * user's own machine or their own container, so it is a short trip, but it is
	 * not the same promise. Turned off, everything runs in the tab exactly as it
	 * used to.
	 */
	serverSideGeneration: boolean;
	/** Read the pages a message links to. Enforced server-side by `/api/fetch`. */
	webFetchEnabled: boolean;
	webFetchByDefault: boolean;
	webFetchMaxPages: number;
	webFetchMaxChars: number;
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
	 * Where to read the persona store, when it is not the public one.
	 *
	 * Empty means `DEFAULT_PERSONA_STORE`. A closed network points this at its own
	 * mirror; nothing else needs to change, because every path in the listing is
	 * relative to this address.
	 */
	personaStoreUrl: string;
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
	 * about legibility and about cost — `backdrop-filter` is paid on every frame
	 * of every scroll — not a taste one, and it deserves to be reachable in one
	 * click. The system's reduced-transparency preference forces it off whatever
	 * this says.
	 */
	surfaceTransparency: boolean;
	/**
	 * Where along the axis, from 0 to 100, with 50 the reference the surfaces are
	 * drawn for and the middle of the track, marked so it can be found again. Low is glass: see-through, barely blurred, the content behind
	 * readable. High is tint: dense and heavily blurred, closer to paint. The two
	 * properties move together because either one alone is unusable — transparency
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
	onboardingComplete: boolean;
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
	titleModel: null,
	compactModel: null,
	autoCompact: false,
	compactThreshold: 80000,
	webSearchByDefault: false,
	webSearchAuto: false,
	// Off by default: the text protocols work everywhere and have the mileage, and
	// a small model that calls tools badly fails in ways a user did not ask for.
	nativeTools: 'off',
	serverSideGeneration: true,
	webFetchEnabled: true,
	webFetchByDefault: true,
	webFetchMaxPages: 3,
	webFetchMaxChars: 20000,
	searchUrl: '',
	searchBackend: 'degoog',
	searchToken: '',
	interactiveChoices: true,
	sendCurrentDate: true,
	promptOverrides: {},
	systemPrompts: { global: '', perModel: {} },
	personaStoreUrl: '',
	personaStoreLayout: 'grid',
	personaAutoUpdate: false,
	mentionsSequential: true,
	knowledgeCollections: [],
	collapsedCollections: [],
	homeShowHeader: true,
	homeShowSuggestions: true,
	homeShowRecentPersonas: true,
	homeRecentPersonasCount: 3,
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
	onboardingComplete: false,
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
