import type { Locales } from '$i18n/i18n-types';
import { env } from '$env/dynamic/public';
import { version } from '$app/environment';

import type { HollamaNextMetadata } from '../routes/api/metadata/+server';

export interface Model {
	serverId: string;
	name: string;
	size?: number;
	parameterSize?: string;
	modifiedAt?: Date;
}

export interface Settings {
	models: Model[];
	lastUsedModels: Model[];
	lastUpdateCheck: number | null;
	autoCheckForUpdates: boolean;
	defaultModel: string | null;
	generateTitlesWithAI: boolean;
	titleModel: string | null;
	themeMode: 'system' | 'light' | 'dark';
	themeStyle: 'classic' | 'dracula' | 'catppuccin';
	userLanguage: Locales | null;
	sidebarExpanded: boolean;
	onboardingComplete: boolean;
	hollamaMetadata: HollamaNextMetadata;
	profileFirstName: string;
	profileLastName: string;
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
	profileAvatar: '',
	profileColor: '#6366f1'
};
