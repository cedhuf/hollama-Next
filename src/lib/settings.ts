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
	/** Set once the built-in starter personas have been seeded (admins / local mode). */
	defaultPersonasSeeded: boolean;
	/** Names of starter personas already seeded, so new defaults backfill without re-adding deleted ones. */
	seededPersonaNames: string[];
	/** Named groups of knowledge. Kept here so an empty one survives and no table is needed. */
	knowledgeCollections: KnowledgeCollection[];
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
	 * Show pin and delete buttons on the rows of the sidebar lists. Off by
	 * default: both live in the right-click menu, where they cannot cover a title
	 * or be hit by accident.
	 */
	showListQuickActions: boolean;
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
	themeMode: 'system' | 'light' | 'dark';
	themeStyle: 'classic' | 'dracula' | 'catppuccin' | 'gruvbox' | 'nord' | 'solarized';
	userLanguage: Locales | null;
	sidebarExpanded: boolean;
	onboardingComplete: boolean;
	/** Server mode: the new-user welcome tour (app intro, theme, personas) has been seen. */
	welcomeComplete: boolean;
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
	defaultPersonasSeeded: false,
	seededPersonaNames: [],
	knowledgeCollections: [],
	homeShowHeader: true,
	homeShowSuggestions: true,
	homeShowRecentPersonas: true,
	homeRecentPersonasCount: 3,
	homeShowRecentSessions: true,
	homeRecentSessionsCount: 4,
	showPinnedPersonas: true,
	showListQuickActions: false,
	accentUserMessages: true,
	showMessageTimestamps: true,
	fadeCompactedMessages: true,
	documentsEnabled: true,
	documentOcr: false,
	documentOcrLanguage: 'eng',
	themeMode: 'system',
	themeStyle: 'classic',
	userLanguage: null,
	sidebarExpanded: true,
	onboardingComplete: false,
	welcomeComplete: false,
	lloomaMetadata: { currentVersion: version },
	profileFirstName: '',
	profileLastName: '',
	profileEmail: '',
	profileAvatar: '',
	profileColor: '#6366f1',
	autoExpandReasoningBlocks: false
};
