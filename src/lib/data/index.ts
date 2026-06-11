import { env } from '$env/dynamic/public';

import { ApiRepository } from './apiRepository';
import { LocalStorageRepository } from './localStorageRepository';
import type { DataRepository } from './repository';

/**
 * The active data repository for this deployment, chosen at deploy time via
 * `PUBLIC_MODE` (see ARCHITECTURE.md §7):
 *   - `server` → SQLite behind `/api/data` (async, no synchronous `hydrate()`).
 *   - anything else (default) → browser `localStorage`.
 */
export const repository: DataRepository =
	env.PUBLIC_MODE === 'server' ? new ApiRepository() : new LocalStorageRepository();

export type { AppData, Backup, DataRepository } from './repository';
