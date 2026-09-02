import { getConfig } from '$lib/server/db/config';
import { resolveShared, type Sharing } from '$lib/server/sharing';
import {
	DEFAULT_SETTINGS,
	type ModelSystemPrompt,
	type Settings,
	type SystemPrompts
} from '$lib/settings';

export type SystemPromptsSharing = Sharing;

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
		/* malformed: ignore */
	}
	return { global: getConfig('systemPromptsGlobal') ?? '', perModel };
}

const hasContent = (p: SystemPrompts) => !!p.global.trim() || Object.keys(p.perModel).length > 0;

/** The three modes are in `sharing.ts`; this only says what a system prompt is. */
export function resolveSystemPrompts(
	userSettings: Settings | null,
	isAdmin: boolean
): ResolvedSystemPrompts {
	const shared = resolveShared<SystemPrompts>({
		own: userSettings?.systemPrompts ?? DEFAULT_SETTINGS.systemPrompts,
		admin: adminSnapshot,
		empty: EMPTY,
		sharing: (getConfig('systemPromptsSharing') as Sharing) || 'off',
		isAdmin,
		hasContent
	});

	const { value, adminValue, ...rest } = shared;
	return { prompts: value, adminPrompts: adminValue, ...rest };
}
