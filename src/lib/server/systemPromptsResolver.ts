import { getConfig } from '$lib/server/db/config';
import {
	DEFAULT_SETTINGS,
	type ModelSystemPrompt,
	type Settings,
	type SystemPrompts
} from '$lib/settings';

export type SystemPromptsSharing = 'off' | 'locked' | 'overridable';

export interface ResolvedSystemPrompts {
	prompts: SystemPrompts;
	editable: boolean;
	source: 'admin' | 'user' | 'none';
	shared: boolean;
	/** The admin's shared snapshot (for the overridable default + "restore"). */
	adminPrompts: SystemPrompts;
}

const EMPTY: SystemPrompts = { global: '', perModel: {} };

function adminSnapshot(): SystemPrompts {
	let perModel: Record<string, ModelSystemPrompt> = {};
	try {
		perModel = JSON.parse(getConfig('systemPromptsPerModel') ?? '{}');
	} catch {
		/* malformed — ignore */
	}
	return { global: getConfig('systemPromptsGlobal') ?? '', perModel };
}

const hasContent = (p: SystemPrompts) => !!p.global.trim() || Object.keys(p.perModel).length > 0;

/**
 * Resolve the effective system prompts for a user (server mode):
 *   - off          → the user's own prompts (editable)
 *   - locked       → the admin's snapshot, read-only
 *   - overridable  → the admin's snapshot as a default the user may override
 *                    (their own prompts win once set; "restore" clears them)
 * Admins always edit their own. Per-group prompts are deferred.
 */
export function resolveSystemPrompts(
	userSettings: Settings | null,
	isAdmin: boolean
): ResolvedSystemPrompts {
	const own = userSettings?.systemPrompts ?? DEFAULT_SETTINGS.systemPrompts;
	const sharing = (getConfig('systemPromptsSharing') as SystemPromptsSharing) || 'off';

	if (isAdmin || sharing === 'off') {
		return { prompts: own, editable: true, source: 'user', shared: false, adminPrompts: EMPTY };
	}

	const admin = adminSnapshot();

	if (sharing === 'locked') {
		return { prompts: admin, editable: false, source: 'admin', shared: true, adminPrompts: admin };
	}

	// overridable
	return hasContent(own)
		? { prompts: own, editable: true, source: 'user', shared: true, adminPrompts: admin }
		: { prompts: admin, editable: true, source: 'admin', shared: true, adminPrompts: admin };
}
