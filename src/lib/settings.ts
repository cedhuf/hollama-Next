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

/** 'replace' takes over, 'extend' is appended. '' when nothing is configured. */
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
	/** Persisted, so the About panel reports a result next to the timestamp it shows. */
	lastKnownVersion: string;
	autoCheckForUpdates: boolean;
	/** The version already announced by a toast, so it is only announced once. */
	notifiedUpdateVersion: string;
	defaultModel: string | null;
	generateTitlesWithAI: boolean;
	titleModel: string | null;
	/**
	 * Name the conversation again once it has grown into one: the first title is
	 * written from a single question. Once only, and never over a typed title,
	 * which is what `titleEdited` on the conversation is for.
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
	/** On by default, unlike the writer: a title is a handful of tokens, and it is what a list of pictures is read by. */
	imageAutoTitle: boolean;
	/** Empty means the default model, as everywhere else. A switch is how it is turned off. */
	imagePromptModel: string | null;
	/** An absent field is the provider deciding, so there is no third answer to represent. A conversation lays its overrides on top. */
	sampling: SamplingOptions;
	/** Compact on its own once the conversation crosses `compactThreshold`. */
	autoCompact: boolean;
	/** Also the ceiling the load indicator measures against: only Ollama's `num_ctx` is ever known. */
	compactThreshold: number;
	webSearchByDefault: boolean;
	webSearchAuto: boolean;
	/**
	 * `off` keeps the `<read>` blocks and the router pre-pass, which work
	 * everywhere. `auto` calls natively where it is known to be supported. `force`
	 * is for a self-hosted server that supports it with no way to say so.
	 */
	nativeTools: 'off' | 'auto' | 'force';
	/** Read the pages a message links to. Enforced server-side, inside the turn. */
	webFetchEnabled: boolean;
	webFetchByDefault: boolean;
	webFetchMaxPages: number;
	webFetchMaxChars: number;
	/** How many MCP tools may be sent to the model at once, across every server. */
	mcpMaxTools: number;
	/** Whether a new conversation starts with the MCP tools switched on. */
	mcpByDefault: boolean;
	/** Announce the servers and fetch a catalogue only when the model asks. Experimental. */
	mcpProgressive: boolean;
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
	/** Empty means `DEFAULT_STORE`. One address for every catalogue under it, since every path in a listing is relative to its own catalogue. */
	storeUrl: string;
	/** How the persona store draws its entries: cards to browse, rows to scan. */
	personaStoreLayout: 'grid' | 'list';
	/** Only for the ones you have not touched: replacing your own text is a loss, not an update, so those are offered instead. */
	personaAutoUpdate: boolean;
	/** Take a new revision of an installed playbook, for the ones you have not touched. */
	playbookAutoUpdate: boolean;
	/** On, they answer in order having read each other. Off, each gets the same question and none of the answers, for independent opinions. */
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
	/** New chat on the search row, personas as avatars. Off by default: the full header names what its controls do. */
	compactSidebarHeader: boolean;

	/** Off by default: both live in the right-click menu, where they cannot cover a title or be hit by accident. */
	showListQuickActions: boolean;
	/** A pill hovering over the conversation rather than the column's top edge. On: it matches the composer floating at the other end. */
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
	/** An instance can offer a starting theme, and that offer stops the first time someone chooses. The stored values alone cannot tell the two apart. */
	themeChosen: boolean;
	themeMode: 'system' | 'light' | 'dark';
	themeStyle: 'classic' | 'dracula' | 'catppuccin' | 'gruvbox' | 'nord' | 'solarized';
	/** Its own switch rather than the bottom of the slider: `backdrop-filter` is paid on every frame of every scroll. The system's reduced-transparency preference forces it off. */
	surfaceTransparency: boolean;
	/** 0 to 100, 50 the reference the surfaces are drawn for. Low is glass, high is tint. Blur and transparency move together, since either alone is unusable. */
	surfaceTransparencyLevel: number;
	/** 0 to 100, 50 the reference. Its own axis: a busy photograph needs softening whether the panes are glass or paint. At 0 the picture is left alone. */
	backgroundBlurLevel: number;
	/** A preference about being asked, so it travels. When it was last asked is a fact about one device and stays there. */
	offerInstall: boolean;
	/** A data URL. The sidebar's materials let it through, the conversation stays opaque over it. */
	backgroundImage: string;
	userLanguage: Locales | null;
	sidebarExpanded: boolean;
	/**
	 * Send this account to the mobile-first interface under `/m`.
	 *
	 * A setting rather than a breakpoint: the two are different products, not one
	 * at two widths. It still takes a phone to have any effect. On by default, and
	 * stated in Settings the other way round, as switching it off.
	 */
	simplifiedMobileUI: boolean;
	/**
	 * Whether the one-time switch to the phone interface has happened.
	 *
	 * The whole settings object is persisted, so every existing account carries an
	 * explicit `simplifiedMobileUI: false` from when that was the default: changing
	 * the default alone would have reached nobody. Turning a stored `false` into a
	 * `true` is defensible exactly once, because the setting was buried and off, so
	 * a stored `false` cannot be somebody who turned it off. This flag is what makes
	 * it once, and what leaves a way back to the classic interface.
	 */
	mobileDefaultApplied: boolean;
	/** Off by default: transcription is a second model on a connection somebody has to set up, and a microphone that fails on first press is worse than none. */
	voiceInput: boolean;
	/** Which model transcribes. Null means none has been chosen, and the feature waits. */
	voiceModel: string | null;
	/** Its own switch rather than a consequence of `voiceInput`: being talked at is a mode, and usually a second model again. */
	speechOutput: boolean;
	/** Which model reads aloud. Null means none has been chosen. */
	speechModel: string | null;
	/** A name the provider knows, required by every endpoint that does this, so an empty one fails rather than picking something. */
	speechVoice: string;
	/**
	 * How long a silence ends the recording on the voice screen, in milliseconds.
	 * A setting because the right value is a fact about the person and the room. The
	 * composer's microphone ignores it: it stops when you say so.
	 */
	/**
	 * The spoken language, ISO 639-1. Empty means let it work out.
	 *
	 * Dictation only. Reading aloud has nowhere to put it: on Kokoro, Aura and
	 * Voxtral the language is part of the voice's name, and on Gemini and Grok the
	 * voices are timbres, with the language taken from the text.
	 */
	voiceLanguage: string;
	/**
	 * Whether the voice screen shows what was said. Reading along catches a question
	 * the recogniser misheard; with the phone on the table it is text nobody is
	 * looking at, on the one screen whose point is not having to.
	 */
	voiceTranscript: boolean;
	/** On, a conversation you hold with the phone on the table. Off, it answers and stops. Wanting it off is not the same as not wanting the feature. */
	voiceAutoContinue: boolean;
	/** Server mode: the new-user welcome tour (app intro, theme, personas) has been seen. */
	welcomeComplete: boolean;
	/** Lets an admin replay the tour for the whole instance without the server keeping a list of who has seen what. */
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
	// Off by default: the text protocols work everywhere, and a small model that
	// calls tools badly fails in ways nobody asked for.
	nativeTools: 'off',
	webFetchEnabled: true,
	webFetchByDefault: true,
	webFetchMaxPages: 3,
	webFetchMaxChars: 20000,
	mcpMaxTools: MCP_LIMITS.defaultTools,
	// Off, unlike the web toggles: sending the catalogues is what makes a call
	// possible, so a conversation that has not asked cannot produce one. It also
	// keeps ordinary turns from carrying definitions they never use.
	mcpByDefault: false,
	// Off, and experimental. It trades the definitions a request carries for an
	// extra round and a missed prompt cache, and which wins depends on the
	// catalogue, the usage and what the provider charges for cached tokens.
	mcpProgressive: false,
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
