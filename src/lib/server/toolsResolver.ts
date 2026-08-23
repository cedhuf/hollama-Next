import { getConfig } from '$lib/server/db/config';
import type { Settings } from '$lib/settings';

/**
 * Which tools a user may use, and with what limits.
 *
 * Enforced where it is decided: `/api/fetch` calls `resolveTools` itself and
 * refuses, so turning a tool off is a real boundary rather than a hidden button.
 * The shared models and the locked prompt are policed the same way, in
 * `llmPolicy`.
 */

export type ToolsSharing = 'off' | 'locked' | 'overridable';

export const WEB_FETCH_DEFAULTS = { maxPages: 3, maxChars: 20_000 };
/** Ceilings a user's own settings can't exceed, whatever the client sends. */
export const WEB_FETCH_CEILINGS = { maxPages: 10, maxChars: 100_000 };

export interface ResolvedTools {
	webFetch: boolean;
	maxPages: number;
	maxChars: number;
	/** False when the admin locked these values: the GUI shows them read-only. */
	editable: boolean;
	source: 'admin' | 'user';
}

function clamp(value: number | undefined, fallback: number, ceiling: number): number {
	if (!Number.isFinite(value)) return fallback;
	return Math.min(Math.max(Math.trunc(value as number), 0), ceiling);
}

function adminTools(): { enabled: boolean; maxPages: number; maxChars: number } {
	return {
		// The admin's own switch, snapshotted when they shared it: "locked" means
		// their configuration exactly, including having the tool off.
		enabled: getConfig('webFetchEnabled') !== 'false',
		maxPages: clamp(
			Number(getConfig('webFetchMaxPages')),
			WEB_FETCH_DEFAULTS.maxPages,
			WEB_FETCH_CEILINGS.maxPages
		),
		maxChars: clamp(
			Number(getConfig('webFetchMaxChars')),
			WEB_FETCH_DEFAULTS.maxChars,
			WEB_FETCH_CEILINGS.maxChars
		)
	};
}

/**
 * The effective tool policy for one user (server mode).
 *
 * Admins answer to their own settings: sharing is a separate decision, made in
 * the Admin tab, and locking themselves out of a tool they administer would be
 * absurd.
 */
export function resolveTools(userSettings: Settings | null, isAdmin: boolean): ResolvedTools {
	const own = {
		webFetch: userSettings?.webFetchEnabled !== false,
		maxPages: clamp(
			userSettings?.webFetchMaxPages,
			WEB_FETCH_DEFAULTS.maxPages,
			WEB_FETCH_CEILINGS.maxPages
		),
		maxChars: clamp(
			userSettings?.webFetchMaxChars,
			WEB_FETCH_DEFAULTS.maxChars,
			WEB_FETCH_CEILINGS.maxChars
		)
	};

	if (isAdmin) return { ...own, editable: true, source: 'user' };

	const sharing = (getConfig('webFetchSharing') as ToolsSharing) || 'off';
	if (sharing === 'off') return { ...own, editable: true, source: 'user' };

	const admin = adminTools();

	if (sharing === 'locked') {
		return {
			webFetch: admin.enabled,
			maxPages: admin.maxPages,
			maxChars: admin.maxChars,
			editable: false,
			source: 'admin'
		};
	}

	// Overridable: the admin decides whether the tool exists at all, the user
	// tunes it below the ceiling the admin set.
	return {
		webFetch: admin.enabled && own.webFetch,
		maxPages: Math.min(own.maxPages, admin.maxPages),
		maxChars: Math.min(own.maxChars, admin.maxChars),
		editable: admin.enabled,
		source: 'admin'
	};
}
