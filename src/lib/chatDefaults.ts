import { derived, writable } from 'svelte/store';

import { env } from '$env/dynamic/public';
import { settingsStore } from '$lib/localStorage';

const isServer = env.PUBLIC_MODE === 'server';

export interface ChatDefaultsView {
	defaultModel: { value: string; editable: boolean; source: 'admin' | 'user'; adminValue: string };
	title: {
		generateTitlesWithAI: boolean;
		titleModel: string;
		titleServerId: string;
		editable: boolean;
		source: 'admin' | 'user';
		admin: { generateTitlesWithAI: boolean; titleModel: string; titleServerId: string };
	};
}

const serverConfig = writable<ChatDefaultsView | null>(null);

export async function loadServerChatDefaults(): Promise<void> {
	if (!isServer) return;
	try {
		const response = await fetch('/api/chat-defaults/config');
		if (response.ok) serverConfig.set(await response.json());
	} catch {
		/* leave null */
	}
}

/** The effective, reactive chat defaults (default model + title) for the user. */
export const chatDefaultsConfig = derived(
	[settingsStore, serverConfig],
	([$s, $srv]): ChatDefaultsView => {
		const own: ChatDefaultsView = {
			defaultModel: {
				value: $s.defaultModel ?? '',
				editable: true,
				source: 'user',
				adminValue: ''
			},
			title: {
				generateTitlesWithAI: $s.generateTitlesWithAI,
				titleModel: $s.titleModel ?? '',
				titleServerId: '',
				editable: true,
				source: 'user',
				admin: { generateTitlesWithAI: false, titleModel: '', titleServerId: '' }
			}
		};

		if (!isServer || !$srv) return own;

		// Default model: locked → admin's; editable → live own, falling back to the admin default.
		const dm = !$srv.defaultModel.editable
			? $srv.defaultModel
			: $s.defaultModel
				? { ...$srv.defaultModel, value: $s.defaultModel, source: 'user' as const }
				: { ...$srv.defaultModel, value: $srv.defaultModel.adminValue };

		// Title: locked → admin's; editable → live own once the user picked a title model.
		const t = !$srv.title.editable
			? $srv.title
			: $s.titleModel
				? {
						...$srv.title,
						generateTitlesWithAI: $s.generateTitlesWithAI,
						titleModel: $s.titleModel,
						titleServerId: '',
						source: 'user' as const
					}
				: { ...$srv.title, ...$srv.title.admin };

		return { defaultModel: dm, title: t };
	}
);
