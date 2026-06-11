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
