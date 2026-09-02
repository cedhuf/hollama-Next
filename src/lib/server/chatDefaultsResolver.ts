import { parseSamplingOptions, type SamplingOptions } from '$lib/chat/options';
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
		regenerateTitle: boolean;
		regenerateTitleAfter: number;
		editable: boolean;
		source: 'admin' | 'user';
		admin: {
			generateTitlesWithAI: boolean;
			titleModel: string;
			titleServerId: string;
			regenerateTitle: boolean;
			regenerateTitleAfter: number;
		};
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
	/** In this resolver rather than one of its own: the question is the same one, which model an account uses for a job it did not choose a model for, and who decides. */
	images: {
		defaultImageModel: string;
		imagePromptWriter: boolean;
		imagePromptModel: string;
		editable: boolean;
		source: 'admin' | 'user';
		admin: { defaultImageModel: string; imagePromptWriter: boolean; imagePromptModel: string };
	};
	/** Same reason as the images group. An administrator who has set up a transcription model is usually the only person who could have, so sharing it is the difference between a feature everybody has and one only they have. */
	voice: {
		voiceInput: boolean;
		voiceModel: string;
		editable: boolean;
		source: 'admin' | 'user';
		admin: { voiceInput: boolean; voiceModel: string };
	};
	/**
	 * The sampling every conversation on this account starts from, shared the same
	 * three ways as everything else here.
	 *
	 * The values are only ever typed in Settings; the Admin tab holds the sharing
	 * choice, and the snapshot is the administrator's own set as it stood then.
	 * Nothing is published by merely existing: `off` keeps their numbers personal.
	 */
	sampling: {
		value: SamplingOptions;
		editable: boolean;
		source: 'admin' | 'user';
		adminValue: SamplingOptions;
	};
}

/** Each of these is independently off / locked / overridable. The admin's values are a snapshot in app_config; admins always see their own, editable. */
export function resolveChatDefaults(
	userSettings: Settings | null,
	isAdmin: boolean
): ResolvedChatDefaults {
	const ownDefaultModel = userSettings?.defaultModel ?? '';
	const ownTitle = {
		generateTitlesWithAI: userSettings?.generateTitlesWithAI ?? false,
		titleModel: userSettings?.titleModel ?? '',
		titleServerId: '',
		regenerateTitle: userSettings?.regenerateTitle ?? DEFAULT_SETTINGS.regenerateTitle,
		regenerateTitleAfter:
			userSettings?.regenerateTitleAfter ?? DEFAULT_SETTINGS.regenerateTitleAfter
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
		titleServerId: getConfig('titleServerId') ?? '',
		regenerateTitle: getConfig('titleRegenerate') === 'true',
		regenerateTitleAfter: Number(
			getConfig('titleRegenerateAfter') ?? DEFAULT_SETTINGS.regenerateTitleAfter
		)
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
		// overridable: the user's own once they have turned it on for themselves
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

	// --- images ---
	const ownImages = {
		defaultImageModel: userSettings?.defaultImageModel ?? '',
		imagePromptWriter: userSettings?.imagePromptWriter ?? DEFAULT_SETTINGS.imagePromptWriter,
		imagePromptModel: userSettings?.imagePromptModel ?? ''
	};
	const adminImages = {
		defaultImageModel: getConfig('defaultImageModel') ?? '',
		imagePromptWriter: getConfig('imagePromptWriter') !== 'false',
		imagePromptModel: getConfig('imagePromptModel') ?? ''
	};
	const imagesSharing = (getConfig('imagesSharing') as Sharing) || 'off';

	let images: ResolvedChatDefaults['images'];
	if (isAdmin || imagesSharing === 'off') {
		images = { ...ownImages, editable: true, source: 'user', admin: adminImages };
	} else if (imagesSharing === 'locked') {
		images = { ...adminImages, editable: false, source: 'admin', admin: adminImages };
	} else {
		images = ownImages.defaultImageModel
			? { ...ownImages, editable: true, source: 'user', admin: adminImages }
			: { ...adminImages, editable: true, source: 'admin', admin: adminImages };
	}

	// --- voice ---
	const ownVoice = {
		voiceInput: userSettings?.voiceInput ?? DEFAULT_SETTINGS.voiceInput,
		voiceModel: userSettings?.voiceModel ?? ''
	};
	const adminVoice = {
		voiceInput: getConfig('voiceInput') === 'true',
		voiceModel: getConfig('voiceModel') ?? ''
	};
	const voiceSharing = (getConfig('voiceSharing') as Sharing) || 'off';

	let voice: ResolvedChatDefaults['voice'];
	if (isAdmin || voiceSharing === 'off') {
		voice = { ...ownVoice, editable: true, source: 'user', admin: adminVoice };
	} else if (voiceSharing === 'locked') {
		voice = { ...adminVoice, editable: false, source: 'admin', admin: adminVoice };
	} else {
		// The sentinel is the model, as everywhere else: an account that has chosen one
		// has an opinion, one that has not takes the instance's.
		voice = ownVoice.voiceModel
			? { ...ownVoice, editable: true, source: 'user', admin: adminVoice }
			: { ...adminVoice, editable: true, source: 'admin', admin: adminVoice };
	}

	// --- sampling ---
	//
	// The same three states and the same sentinel: an account that has set nothing
	// takes the shared set, and the first number it types makes the whole set its
	// own. Not a merge, deliberately: half a temperature from one place and half a
	// top-k from another is a combination nobody chose.
	const adminSampling = parseSamplingOptions(getConfig('sampling'));
	const ownSampling = parseSamplingOptions(userSettings?.sampling);
	const samplingSharing = (getConfig('samplingSharing') as Sharing) || 'off';

	let sampling: ResolvedChatDefaults['sampling'];
	if (isAdmin || samplingSharing === 'off') {
		sampling = { value: ownSampling, editable: true, source: 'user', adminValue: adminSampling };
	} else if (samplingSharing === 'locked') {
		sampling = {
			value: adminSampling,
			editable: false,
			source: 'admin',
			adminValue: adminSampling
		};
	} else {
		sampling = Object.keys(ownSampling).length
			? { value: ownSampling, editable: true, source: 'user', adminValue: adminSampling }
			: { value: adminSampling, editable: true, source: 'admin', adminValue: adminSampling };
	}

	return { defaultModel, title, compact, images, voice, sampling };
}
