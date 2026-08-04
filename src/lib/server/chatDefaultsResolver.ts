import { getConfig } from '$lib/server/db/config';
import { DEFAULT_SETTINGS, type Settings } from '$lib/settings';

export type Sharing = 'off' | 'locked' | 'overridable';

export interface ResolvedChatDefaults {
	defaultModel: {
		value: string;
		editable: boolean;
		source: 'admin' | 'user';
		adminValue: string;
	};
	title: {
		generateTitlesWithAI: boolean;
		titleModel: string;
		titleServerId: string;
		editable: boolean;
		source: 'admin' | 'user';
		admin: { generateTitlesWithAI: boolean; titleModel: string; titleServerId: string };
	};
	compact: {
		compactModel: string;
		compactServerId: string;
		autoCompact: boolean;
		compactThreshold: number;
		editable: boolean;
		source: 'admin' | 'user';
		admin: {
			compactModel: string;
			compactServerId: string;
			autoCompact: boolean;
			compactThreshold: number;
		};
	};
}

/**
 * Resolve the admin-shared chat defaults (default model + title generation) for
 * a user. Each is independently off / locked / overridable. The admin's values
 * are a snapshot kept in app_config; admins always see their own (editable).
 */
export function resolveChatDefaults(
	userSettings: Settings | null,
	isAdmin: boolean
): ResolvedChatDefaults {
	const ownDefaultModel = userSettings?.defaultModel ?? '';
	const ownTitle = {
		generateTitlesWithAI: userSettings?.generateTitlesWithAI ?? false,
		titleModel: userSettings?.titleModel ?? '',
		titleServerId: ''
	};

	const ownCompact = {
		compactModel: userSettings?.compactModel ?? '',
		compactServerId: '',
		autoCompact: userSettings?.autoCompact ?? DEFAULT_SETTINGS.autoCompact,
		compactThreshold: userSettings?.compactThreshold ?? DEFAULT_SETTINGS.compactThreshold
	};

	const defaultModelSharing = (getConfig('defaultModelSharing') as Sharing) || 'off';
	const titleSharing = (getConfig('titleSharing') as Sharing) || 'off';
	const compactSharing = (getConfig('compactSharing') as Sharing) || 'off';

	const adminDefaultModel = getConfig('defaultModel') ?? '';
	const adminTitle = {
		generateTitlesWithAI: getConfig('titleEnabled') === 'true',
		titleModel: getConfig('titleModel') ?? '',
		titleServerId: getConfig('titleServerId') ?? ''
	};
	const adminCompact = {
		compactModel: getConfig('compactModel') ?? '',
		compactServerId: getConfig('compactServerId') ?? '',
		autoCompact: getConfig('compactAuto') === 'true',
		compactThreshold: Number(getConfig('compactThreshold') ?? DEFAULT_SETTINGS.compactThreshold)
	};

	// --- default model ---
	let defaultModel: ResolvedChatDefaults['defaultModel'];
	if (isAdmin || defaultModelSharing === 'off') {
		defaultModel = { value: ownDefaultModel, editable: true, source: 'user', adminValue: '' };
	} else if (defaultModelSharing === 'locked') {
		defaultModel = {
			value: adminDefaultModel,
			editable: false,
			source: 'admin',
			adminValue: adminDefaultModel
		};
	} else {
		defaultModel = ownDefaultModel
			? { value: ownDefaultModel, editable: true, source: 'user', adminValue: adminDefaultModel }
			: {
					value: adminDefaultModel,
					editable: true,
					source: 'admin',
					adminValue: adminDefaultModel
				};
	}

	// --- title generation ---
	let title: ResolvedChatDefaults['title'];
	if (isAdmin || titleSharing === 'off') {
		title = { ...ownTitle, editable: true, source: 'user', admin: adminTitle };
	} else if (titleSharing === 'locked') {
		title = { ...adminTitle, editable: false, source: 'admin', admin: adminTitle };
	} else {
		// overridable: the user's own once they've turned it on for themselves
		title = ownTitle.titleModel
			? { ...ownTitle, editable: true, source: 'user', admin: adminTitle }
			: { ...adminTitle, editable: true, source: 'admin', admin: adminTitle };
	}

	// --- compaction ---
	let compact: ResolvedChatDefaults['compact'];
	if (isAdmin || compactSharing === 'off') {
		compact = { ...ownCompact, editable: true, source: 'user', admin: adminCompact };
	} else if (compactSharing === 'locked') {
		compact = { ...adminCompact, editable: false, source: 'admin', admin: adminCompact };
	} else {
		compact = ownCompact.compactModel
			? { ...ownCompact, editable: true, source: 'user', admin: adminCompact }
			: { ...adminCompact, editable: true, source: 'admin', admin: adminCompact };
	}

	return { defaultModel, title, compact };
}
