import { type AppPromptsView, type PromptOverrides } from '$lib/appPrompts';
import { PROMPT_KEYS } from '$lib/defaultPrompts';
import { getConfig, setConfig } from '$lib/server/db/config';
import { resolveShared, type Sharing } from '$lib/server/sharing';
import { DEFAULT_SETTINGS, type Settings } from '$lib/settings';

export type ResolvedAppPrompts = AppPromptsView;

const EMPTY: PromptOverrides = {};

/** Only keys the app still knows about: a removed prompt would otherwise sit in the config forever and reappear the day a new one reused its name. */
function clean(raw: unknown): PromptOverrides {
	if (!raw || typeof raw !== 'object') return {};
	const source = raw as Record<string, unknown>;
	const out: PromptOverrides = {};
	for (const key of PROMPT_KEYS) {
		const value = source[key];
		if (typeof value === 'string' && value.trim()) out[key] = value;
	}
	return out;
}

function adminSnapshot(): PromptOverrides {
	try {
		return clean(JSON.parse(getConfig('appPrompts') ?? '{}'));
	} catch {
		return {};
	}
}

export function appPromptsSharing(): Sharing {
	return (getConfig('appPromptsSharing') as Sharing) || 'off';
}

/** Snapshot the admin's own rewrites, which is what everyone else will read. */
export function setAdminAppPrompts(overrides: unknown): void {
	setConfig('appPrompts', JSON.stringify(clean(overrides)));
}

/** Merged rather than replaced when the mode is overridable: an admin who rewrote the search router and a user who rewrote the compaction prompt should each get what they wrote. */
export function resolveAppPrompts(
	userSettings: Settings | null,
	isAdmin: boolean
): ResolvedAppPrompts {
	return resolveClaimedAppPrompts(
		userSettings?.promptOverrides ?? DEFAULT_SETTINGS.promptOverrides,
		isAdmin
	);
}

/**
 * The same rules applied to what a client says its rewrites are.
 *
 * A run carries them in its body so an edit made a second ago is already in
 * force, which means the body is also where somebody would send rewrites an
 * admin has locked. Passing it through here is the difference between a locked
 * prompt and a suggestion.
 */
export function resolveClaimedAppPrompts(claimed: unknown, isAdmin: boolean): ResolvedAppPrompts {
	const shared = resolveShared<PromptOverrides>({
		own: clean(claimed),
		admin: adminSnapshot,
		empty: EMPTY,
		sharing: appPromptsSharing(),
		isAdmin,
		hasContent: (value) => Object.keys(value).length > 0,
		merge: (admin, own) => ({ ...admin, ...own })
	});

	const { value, adminValue, ...rest } = shared;
	return { overrides: value, adminOverrides: adminValue, ...rest };
}
