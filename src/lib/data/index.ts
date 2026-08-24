import { ApiRepository } from './apiRepository';
import type { DataRepository } from './repository';

/** The data repository: SQLite behind `/api/data`, asynchronous throughout. */
export const repository: DataRepository = new ApiRepository();

export type { AppData, Backup, DataRepository } from './repository';
