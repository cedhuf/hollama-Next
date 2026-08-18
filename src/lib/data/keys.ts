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
	Personas = `${LOCAL_STORAGE_PREFIX}-personas`,
	Playbooks = `${LOCAL_STORAGE_PREFIX}-playbooks`,
	PersonaMemory = `${LOCAL_STORAGE_PREFIX}-persona-memory`
}
