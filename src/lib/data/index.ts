import { LocalStorageRepository } from './localStorageRepository';
import type { DataRepository } from './repository';

/**
 * The active data repository for this deployment.
 *
 * Mode is chosen at deploy time via `PUBLIC_MODE` (see ARCHITECTURE.md §7).
 * Only the local implementation exists today; `ApiRepository` (mode `server`)
 * lands in step 4 of the rollout and will be selected here.
 */
export const repository: DataRepository = new LocalStorageRepository();

export type { AppData, Backup, DataRepository } from './repository';
