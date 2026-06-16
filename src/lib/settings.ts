import type { Locales } from '$i18n/i18n-types';
import { env } from '$env/dynamic/public';
import { version } from '$app/environment';

import type { HollamaNextMetadata } from '../routes/api/metadata/+server';
import type { PromptKey } from './defaultPrompts';

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
	autoCheckForUpdates: boolean;
	defaultModel: string | null;
	generateTitlesWithAI: boolean;
	titleModel: string | null;
	webSearchByDefault: boolean;
	webSearchAuto: boolean;
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
	// Home screen layout toggles
	homeShowHeader: boolean;
	homeShowSuggestions: boolean;
	homeShowRecentPersonas: boolean;
	homeRecentPersonasCount: number;
	homeShowRecentSessions: boolean;
	homeRecentSessionsCount: number;
	/** Show personas you've talked to as pinned launchers in the sidebar. */
	showPinnedPersonas: boolean;
	themeMode: 'system' | 'light' | 'dark';
	themeStyle: 'classic' | 'dracula' | 'catppuccin';
	userLanguage: Locales | null;
	sidebarExpanded: boolean;
	onboardingComplete: boolean;
	hollamaMetadata: HollamaNextMetadata;
	profileFirstName: string;
	profileLastName: string;
	profileEmail: string;
	profileAvatar: string;
	profileColor: string;
}

export const DEFAULT_SETTINGS: Settings = {
	models: [],
	lastUsedModels: [],
	lastUpdateCheck: null,
	autoCheckForUpdates: false,
	defaultModel: null,
	generateTitlesWithAI: false,
	titleModel: null,
	webSearchByDefault: false,
	webSearchAuto: false,
	searchUrl: '',
	searchBackend: 'degoog',
	searchToken: '',
	interactiveChoices: true,
	sendCurrentDate: true,
	promptOverrides: {},
	systemPrompts: { global: '', perModel: {} },
	defaultPersonasSeeded: false,
	seededPersonaNames: [],
	homeShowHeader: true,
	homeShowSuggestions: true,
	homeShowRecentPersonas: true,
	homeRecentPersonasCount: 3,
	homeShowRecentSessions: true,
	homeRecentSessionsCount: 4,
	showPinnedPersonas: true,
	themeMode: 'system',
	themeStyle: 'classic',
	userLanguage: null,
	sidebarExpanded: true,
	onboardingComplete: false,
	hollamaMetadata: {
		currentVersion: version,
		isDocker: env.PUBLIC_ADAPTER === 'docker-node'
	},
	profileFirstName: '',
	profileLastName: '',
	profileEmail: '',
	profileAvatar: '',
	profileColor: '#6366f1'
};
