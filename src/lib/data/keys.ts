/**
 * Storage keys, kept in the data layer so both the repository implementations
 * and the stores can share them without an import cycle. Re-exported from
 * `$lib/localStorage` for backwards-compatibility with existing call sites.
 */
export const LOCAL_STORAGE_PREFIX = 'hollamanext';

export enum StorageKey {
	HollamaNextPreferences = `${LOCAL_STORAGE_PREFIX}-settings`,
	HollamaNextServers = `${LOCAL_STORAGE_PREFIX}-servers`,
	HollamaNextSessions = `${LOCAL_STORAGE_PREFIX}-sessions`,
	HollamaNextKnowledge = `${LOCAL_STORAGE_PREFIX}-knowledge`
}
