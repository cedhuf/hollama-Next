import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { env } from '$env/dynamic/private';
import { APP_SLUG } from '$lib/brand';

import { runMigrations } from './migrations';

let db: DatabaseSync | null = null;

const DB_FILE = `${APP_SLUG}.db`;

/**
 * Lazily opens the SQLite database and applies migrations on first use, so
 * merely importing this module (e.g. during build/prerender) never touches the
 * filesystem. Only called from server endpoints in `server` mode.
 *
 * All mutable state lives under a single `DATA_DIR` so the whole config can be
 * bind-mounted (Docker/Nix). Defaults to `./data`.
 */
export function getDb(): DatabaseSync {
	if (db) return db;

	const dataDir = env.DATA_DIR?.trim() || './data';
	mkdirSync(dataDir, { recursive: true });

	const instance = new DatabaseSync(join(dataDir, DB_FILE));
	instance.exec('PRAGMA journal_mode = WAL');
	instance.exec('PRAGMA foreign_keys = ON');
	runMigrations(instance);

	db = instance;
	return db;
}
