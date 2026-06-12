import { getConfig } from '$lib/server/db/config';
import type { Settings } from '$lib/settings';

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

	const defaultModelSharing = (getConfig('defaultModelSharing') as Sharing) || 'off';
	const titleSharing = (getConfig('titleSharing') as Sharing) || 'off';

	const adminDefaultModel = getConfig('defaultModel') ?? '';
	const adminTitle = {
		generateTitlesWithAI: getConfig('titleEnabled') === 'true',
		titleModel: getConfig('titleModel') ?? '',
		titleServerId: getConfig('titleServerId') ?? ''
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

	return { defaultModel, title };
}
