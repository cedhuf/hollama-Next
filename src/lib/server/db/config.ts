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

/** Off by default, unlike personas: a bot answers on its own initiative, spends on every message, and reaches a chat server the instance does not own. */
export function allowUserIntegrations(): boolean {
	return getConfig('allowUserIntegrations') === 'true';
}

export function setAllowUserIntegrations(value: boolean): void {
	setConfig('allowUserIntegrations', value ? 'true' : 'false');
}

/**
 * Off by default, for the reason bots are: an MCP server is an outbound address
 * chosen by whoever typed it, whose answers land in the model's context with
 * tool authority.
 *
 * One flag and no sharing modes: there is no admin value to hand down, only a
 * permission. An administrator who wants one server gone suspends that server.
 */
export function allowUserMcp(): boolean {
	return getConfig('allowUserMcp') === 'true';
}

export function setAllowUserMcp(value: boolean): void {
	setConfig('allowUserMcp', value ? 'true' : 'false');
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

/** Clamped on the way out as well as in: a figure edited straight in the database is still one this process has to survive. */
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
 * Not a permission but a composition: the store is the door people know, and the
 * instance decides what is behind it.
 *
 * `open`: the public catalogue plus whatever the admin offers. `curated`: only
 * what the admin offers, the public catalogue staying the admin's own source.
 *
 * A boolean said nothing useful: "may install from the store" left the reader
 * unable to tell everything public from only what had been handed to them.
 */
export type PersonaStoreMode = 'open' | 'curated';

export function personaStoreMode(): PersonaStoreMode {
	return getConfig('personaStoreMode') === 'curated' ? 'curated' : 'open';
}

export function setPersonaStoreMode(value: PersonaStoreMode): void {
	setConfig('personaStoreMode', value);
}

/** Forced rather than defaulted: an administrator who wants their people on the current version should not have to hope each of them ticked a box. */
export function personaAutoUpdateForced(): boolean {
	return getConfig('personaAutoUpdateForced') === 'true';
}

export function setPersonaAutoUpdateForced(value: boolean): void {
	setConfig('personaAutoUpdateForced', value ? 'true' : 'false');
}

/**
 * The instance's address, not each person's: the server is what fetches it.
 * `STORE_URL` seeds it and the admin panel overrides it.
 *
 * One address for every catalogue under it, so a mirror is one folder and one
 * field.
 */
export function storeUrl(): string | undefined {
	return getConfig('storeUrl')?.trim() || undefined;
}

export function setStoreUrl(value: string): void {
	setConfig('storeUrl', value.trim());
}

/** `off` leaves everyone their own, `overridable` sets what a new account starts on, `locked` fixes it and the theme controls go away. */
export type ThemeSharing = 'off' | 'locked' | 'overridable';

/** On unless an admin says otherwise, and total rather than a default: off means no tools offered and nothing written. What was already remembered is left alone, since a toggle should not delete an account's most personal data. */
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
