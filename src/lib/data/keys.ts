/**
 * Storage keys, in the data layer so the repository implementations and the
 * stores share them without an import cycle. Re-exported from
 * `$lib/localStorage` for existing call sites.
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
