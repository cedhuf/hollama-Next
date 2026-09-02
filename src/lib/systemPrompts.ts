import { derived, writable } from 'svelte/store';

import { setServerAppPrompts } from '$lib/appPrompts';
import { settingsStore } from '$lib/localStorage';

import type { SystemPrompts } from './settings';

const EMPTY: SystemPrompts = { global: '', perModel: {} };

const hasContent = (p: SystemPrompts) => !!p.global.trim() || Object.keys(p.perModel).length > 0;

export interface SystemPromptsView {
	prompts: SystemPrompts;
	editable: boolean;
	source: 'admin' | 'user' | 'none';
	shared: boolean;
	adminPrompts: SystemPrompts;
}

// In server mode the resolved config comes from the server (admin sharing).
const serverConfig = writable<SystemPromptsView | null>(null);

export function setServerSystemPrompts(resolved: SystemPromptsView | null): void {
	serverConfig.set(resolved);
}

/** Two screens' worth of one question (what does this instance let you say to the model), resolved by the same rules, so they arrive together rather than racing. */
export async function loadServerPrompts(): Promise<void> {
	try {
		const response = await fetch('/api/prompts/config');
		if (!response.ok) return;
		const config = await response.json();
		serverConfig.set(config.systemPrompts ?? null);
		setServerAppPrompts(config.appPrompts ?? null);
	} catch {
		/* leave null */
	}
}

/** The effective, reactive system-prompts config for the current user. */
export const systemPromptsConfig = derived(
	[settingsStore, serverConfig],
	([$settings, $server]): SystemPromptsView => {
		if (!$server) {
			return {
				prompts: EMPTY,
				editable: false,
				source: 'none',
				shared: false,
				adminPrompts: EMPTY
			};
		}

		// Locked: the admin's prompts, read-only.
		if (!$server.editable) return $server;

		// Editable (off / overridable / admin): the live user settings, falling back to
		// the admin default when the user has set nothing of their own.
		const own = $settings.systemPrompts;
		const usingOwn = hasContent(own);
		return {
			prompts: usingOwn ? own : $server.adminPrompts,
			editable: true,
			source: usingOwn ? 'user' : $server.source,
			shared: $server.shared,
			adminPrompts: $server.adminPrompts
		};
	}
);

/** It moved because it is a pure function and this module is not: everything else here is a store, and a turn in the Node process needs it without the browser plumbing. */
export { effectiveSystemPrompt } from './settings';
