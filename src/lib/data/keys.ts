/**
 * Storage keys, kept in the data layer so both the repository implementations
 * and the stores can share them without an import cycle. Re-exported from
 * `$lib/localStorage` for backwards-compatibility with existing call sites.
 *
 * The `hollamanext` prefix stays after the rename to Llooma, deliberately.
 * These strings are not internal: they are the keys of every exported backup
 * file, so `applyBackup` matches on them when restoring. Renaming them would
 * make every backup written before the rename unreadable, and orphan any
 * local-mode data still in a browser — for a change nobody would ever see.
 */
export const LOCAL_STORAGE_PREFIX = 'hollamanext';

export enum StorageKey {
	HollamaNextPreferences = `${LOCAL_STORAGE_PREFIX}-settings`,
	HollamaNextServers = `${LOCAL_STORAGE_PREFIX}-servers`,
	HollamaNextSessions = `${LOCAL_STORAGE_PREFIX}-sessions`,
	HollamaNextKnowledge = `${LOCAL_STORAGE_PREFIX}-knowledge`,
	HollamaNextPersonas = `${LOCAL_STORAGE_PREFIX}-personas`
}
