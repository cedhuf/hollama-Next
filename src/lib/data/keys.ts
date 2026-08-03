/**
 * Storage keys, kept in the data layer so both the repository implementations
 * and the stores can share them without an import cycle. Re-exported from
 * `$lib/localStorage` for backwards-compatibility with existing call sites.
 */
export const LOCAL_STORAGE_PREFIX = 'llooma';

export enum StorageKey {
	Preferences = `${LOCAL_STORAGE_PREFIX}-settings`,
	Servers = `${LOCAL_STORAGE_PREFIX}-servers`,
	Sessions = `${LOCAL_STORAGE_PREFIX}-sessions`,
	Knowledge = `${LOCAL_STORAGE_PREFIX}-knowledge`,
	Personas = `${LOCAL_STORAGE_PREFIX}-personas`
}

/**
 * What these keys were called before the app was renamed to Llooma.
 *
 * They are not only `localStorage` keys: they are also the keys of every backup
 * file ever exported, so a file written before the rename still uses them.
 * Reading them stays supported indefinitely — an export sitting in someone's
 * downloads folder has no way of knowing the app changed its name.
 */
const LEGACY_PREFIX = 'hollamanext';

export const LEGACY_STORAGE_KEYS: Record<StorageKey, string> = {
	[StorageKey.Preferences]: `${LEGACY_PREFIX}-settings`,
	[StorageKey.Servers]: `${LEGACY_PREFIX}-servers`,
	[StorageKey.Sessions]: `${LEGACY_PREFIX}-sessions`,
	[StorageKey.Knowledge]: `${LEGACY_PREFIX}-knowledge`,
	[StorageKey.Personas]: `${LEGACY_PREFIX}-personas`
};

/**
 * Read a backup entry under its current key, or the one it had before the
 * rename. Used on import, where the file is whatever the user kept.
 */
export function readBackupEntry<T>(
	backup: Partial<Record<string, T>>,
	key: StorageKey
): T | undefined {
	return backup[key] ?? backup[LEGACY_STORAGE_KEYS[key]];
}
