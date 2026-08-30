import {
	BOT_REPLIES_PER_HOUR_MAX,
	BOTS_PER_USER_MAX,
	DEFAULT_BOT_REPLIES_PER_HOUR,
	DEFAULT_BOTS_PER_USER
} from '$lib/integrations';

import { getDb } from './index';

/** Global admin flags, stored in the `app_config` KV table. */
export function getConfig(key: string): string | undefined {
	const row = getDb().prepare('SELECT value FROM app_config WHERE key = ?').get(key) as
		{ value: string } | undefined;
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

/**
 * Whether users may run bots of their own (default: false).
 *
 * Off by default, unlike personas and like provider keys: a bot answers on its
 * own initiative, spends on every message it is sent, and reaches a chat server
 * the instance does not own. That is a thing an administrator grants, not a
 * thing everybody starts with.
 */
export function allowUserIntegrations(): boolean {
	return getConfig('allowUserIntegrations') === 'true';
}

export function setAllowUserIntegrations(value: boolean): void {
	setConfig('allowUserIntegrations', value ? 'true' : 'false');
}

/** How many bots one account may run. */
export function botsPerUser(): number {
	return readCount('botsPerUser', DEFAULT_BOTS_PER_USER, BOTS_PER_USER_MAX);
}

export function setBotsPerUser(value: number): void {
	setConfig('botsPerUser', String(clampCount(value, BOTS_PER_USER_MAX)));
}

/** How many answers an account's bots may produce in an hour, all of them together. */
export function botRepliesPerHour(): number {
	return readCount('botRepliesPerHour', DEFAULT_BOT_REPLIES_PER_HOUR, BOT_REPLIES_PER_HOUR_MAX);
}

export function setBotRepliesPerHour(value: number): void {
	setConfig('botRepliesPerHour', String(clampCount(value, BOT_REPLIES_PER_HOUR_MAX)));
}

/**
 * A stored count, or the default when there is none or it is nonsense.
 *
 * Clamped on the way out as well as on the way in: a figure edited straight in
 * the database is still a figure this process has to survive.
 */
function readCount(key: string, fallback: number, max: number): number {
	const raw = Number(getConfig(key));
	return Number.isFinite(raw) && raw > 0 ? clampCount(raw, max) : fallback;
}

function clampCount(value: number, max: number): number {
	return Math.min(Math.max(Math.round(value), 1), max);
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
 * Where the store is read from.
 *
 * The instance's, not each person's: the server is what fetches it, so the
 * address has to be one an administrator sets. `STORE_URL` seeds it for a
 * deployment that would rather not click, and the admin panel overrides it.
 *
 * One address for every catalogue under it: personas, playbooks, and whatever
 * follows. Somebody running a mirror moves one folder and changes one field.
 */
export function storeUrl(): string | undefined {
	return getConfig('storeUrl')?.trim() || undefined;
}

export function setStoreUrl(value: string): void {
	setConfig('storeUrl', value.trim());
}

/**
 * The theme an instance gives its users, and how firmly.
 *
 * `off` leaves everyone their own. `overridable` sets what a new account starts
 * on and lets them change it. `locked` fixes it, and the theme controls go away:
 * an instance with a house style is making a decision, not a suggestion.
 */
export type ThemeSharing = 'off' | 'locked' | 'overridable';

/**
 * Whether personas may remember anything on this instance.
 *
 * On unless an admin says otherwise, and the switch is total rather than a
 * default: off means the tools are not offered, nothing is injected, and nothing
 * new is written. What was already remembered is left alone, since deleting an
 * account's most personal data as a side effect of a setting is not a thing a
 * toggle should be able to do. People can still erase their own from Data.
 */
export function personaMemoryEnabled(): boolean {
	return getConfig('personaMemoryEnabled') !== 'false';
}

export function setPersonaMemoryEnabled(value: boolean): void {
	setConfig('personaMemoryEnabled', value ? 'true' : 'false');
}

export function themeSharing(): ThemeSharing {
	const value = getConfig('themeSharing');
	return value === 'locked' || value === 'overridable' ? value : 'off';
}

/** Stamp the moment an admin asked everyone to see the tour again. */
export function resetOnboarding(): void {
	setConfig('onboardingEpoch', String(Date.now()));
}
