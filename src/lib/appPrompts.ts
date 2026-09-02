import { derived, writable } from 'svelte/store';

import { PROMPT_KEYS, type PromptKey } from '$lib/defaultPrompts';
import { settingsStore } from '$lib/localStorage';

/**
 * The app's own instructions, and who may change them.
 *
 * The counterpart of `systemPrompts` for everything in `defaultPrompts`. Same
 * three sharing modes, one difference: these merge per prompt, so an admin who
 * rewrote the router and a user who rewrote the summary each keep what they
 * wrote. They are not the same setting, only the same screen.
 */
export type PromptOverrides = Partial<Record<PromptKey, string>>;

export interface AppPromptsView {
	/** The rewrites in force: the admin's, this person's, or the two merged. */
	overrides: PromptOverrides;
	editable: boolean;
	source: 'admin' | 'user' | 'none';
	shared: boolean;
	/** The admin's snapshot, so a rewritten prompt can be handed back to it. */
	adminOverrides: PromptOverrides;
}

const EMPTY: PromptOverrides = {};

const serverConfig = writable<AppPromptsView | null>(null);

export function setServerAppPrompts(resolved: AppPromptsView | null): void {
	serverConfig.set(resolved);
}

/** Only the keys the app still knows, so a stale config cannot resurrect one. */
function clean(raw: PromptOverrides | undefined): PromptOverrides {
	const out: PromptOverrides = {};
	for (const key of PROMPT_KEYS) {
		const value = raw?.[key];
		if (typeof value === 'string' && value.trim()) out[key] = value;
	}
	return out;
}

export const appPromptsConfig = derived(
	[settingsStore, serverConfig],
	([$settings, $server]): AppPromptsView => {
		const own = clean($settings.promptOverrides);

		// Before the config lands: the defaults, and nothing editable yet. Showing the
		// user's own rewrites here would let them edit prompts the instance may be about
		// to say are locked.
		if (!$server) {
			return {
				overrides: EMPTY,
				editable: false,
				source: 'none',
				shared: false,
				adminOverrides: EMPTY
			};
		}

		if (!$server.editable) return $server;

		// Editable: live settings on top of the admin's, since a prompt the user has not
		// touched should still be the one the instance chose.
		const admin = $server.adminOverrides;
		return {
			overrides: { ...admin, ...own },
			editable: true,
			source: Object.keys(own).length ? 'user' : $server.source,
			shared: $server.shared,
			adminOverrides: admin
		};
	}
);

/** Every caller wants the rewrites and not the sharing metadata. Reading `settingsStore.promptOverrides` directly is the bug this prevents: it is the user's own copy, which under a locked instance is the one that must not be used. */
export const effectivePrompts = derived(appPromptsConfig, ($config) => $config.overrides);
