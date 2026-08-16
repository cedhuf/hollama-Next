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
