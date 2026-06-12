import { derived, writable } from 'svelte/store';

import { env } from '$env/dynamic/public';
import { settingsStore } from '$lib/localStorage';

import type { SystemPrompts } from './settings';

const isServer = env.PUBLIC_MODE === 'server';
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

export async function loadServerSystemPrompts(): Promise<void> {
	if (!isServer) return;
	try {
		const response = await fetch('/api/system-prompts/config');
		if (response.ok) serverConfig.set(await response.json());
	} catch {
		/* leave null */
	}
}

/** The effective, reactive system-prompts config for the current user/mode. */
export const systemPromptsConfig = derived(
	[settingsStore, serverConfig],
	([$settings, $server]): SystemPromptsView => {
		if (!isServer) {
			// Local mode: the user's own prompts (localStorage).
			return {
				prompts: $settings.systemPrompts,
				editable: true,
				source: 'user',
				shared: false,
				adminPrompts: EMPTY
			};
		}

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

		// Editable (off / overridable / admin): use the live user settings, falling
		// back to the admin default when the user hasn't set anything of their own.
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

/**
 * The effective system prompt for a model, combining the global prompt with the
 * model-specific one (if any):
 *   - 'replace' → the model prompt takes over entirely
 *   - 'extend'  → the model prompt is appended to the global one
 * Returns '' when nothing is configured (the feature stays inert).
 */
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
