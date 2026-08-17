import { getDb } from './index';

/** Global admin flags, stored in the `app_config` KV table. */
export function getConfig(key: string): string | undefined {
	const row = getDb().prepare('SELECT value FROM app_config WHERE key = ?').get(key) as
		| { value: string }
		| undefined;
	return row?.value;
}

export function setConfig(key: string, value: string): void {
	getDb()
		.prepare(
			`INSERT INTO app_config (key, value) VALUES (?, ?)
			 ON CONFLICT(key) DO UPDATE SET value = excluded.value`
		)
		.run(key, value);
}

/** Whether users may add their own provider connections (default: false). */
export function allowUserKeys(): boolean {
	return getConfig('allowUserKeys') === 'true';
}

export function setAllowUserKeys(value: boolean): void {
	setConfig('allowUserKeys', value ? 'true' : 'false');
}

/** Whether users may create their own personas (default: true). */
export function allowUserPersonas(): boolean {
	return getConfig('allowUserPersonas') !== 'false';
}

export function setAllowUserPersonas(value: boolean): void {
	setConfig('allowUserPersonas', value ? 'true' : 'false');
}

/**
 * What a user's persona store contains (default: the public one).
 *
 * Not a permission but a composition, and that is what makes it readable. A
 * store is the door people already know, so the door stays; what an instance
 * decides is what is behind it.
 *
 * `open`: the public catalogue, plus whatever the admin offers.
 * `curated`: only what the admin offers. The public catalogue remains the
 * admin's own source for choosing, and is never shown to a user.
 *
 * A boolean was tried first and said nothing useful: "may install from the
 * store" left the reader unable to tell whether that meant everything public or
 * only what had been handed to them, and gave an instance no middle ground
 * between all of it and none.
 */
export type PersonaStoreMode = 'open' | 'curated';

export function personaStoreMode(): PersonaStoreMode {
	return getConfig('personaStoreMode') === 'curated' ? 'curated' : 'open';
}

export function setPersonaStoreMode(value: PersonaStoreMode): void {
	setConfig('personaStoreMode', value);
}

/**
 * Whether the instance updates everyone's personas for them.
 *
 * Forced rather than merely defaulted: an administrator who wants their people
 * on the current version of what they hand out should not have to hope each of
 * them ticked a box. Untouched personas only, here as everywhere.
 */
export function personaAutoUpdateForced(): boolean {
	return getConfig('personaAutoUpdateForced') === 'true';
}

export function setPersonaAutoUpdateForced(value: boolean): void {
	setConfig('personaAutoUpdateForced', value ? 'true' : 'false');
}

/**
 * Where the persona store is read from.
 *
 * The instance's, not each person's: the server is what fetches it, so the
 * address has to be one an administrator sets. `PERSONA_STORE_URL` seeds it for
 * a deployment that would rather not click, and the admin panel overrides it.
 */
export function personaStoreUrl(): string | undefined {
	return getConfig('personaStoreUrl')?.trim() || undefined;
}

export function setPersonaStoreUrl(value: string): void {
	setConfig('personaStoreUrl', value.trim());
}

export function playbookStoreUrl(): string | undefined {
	return getConfig('playbookStoreUrl')?.trim() || undefined;
}

export function setPlaybookStoreUrl(value: string): void {
	setConfig('playbookStoreUrl', value.trim());
}

/**
 * The theme an instance gives its users, and how firmly.
 *
 * `off` leaves everyone their own. `overridable` sets what a new account starts
 * on and lets them change it. `locked` fixes it, and the theme controls go away:
 * an instance with a house style is making a decision, not a suggestion.
 */
export type ThemeSharing = 'off' | 'locked' | 'overridable';

export function themeSharing(): ThemeSharing {
	const value = getConfig('themeSharing');
	return value === 'locked' || value === 'overridable' ? value : 'off';
}

/** Stamp the moment an admin asked everyone to see the tour again. */
export function resetOnboarding(): void {
	setConfig('onboardingEpoch', String(Date.now()));
}
