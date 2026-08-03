import { existsSync, mkdirSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { env } from '$env/dynamic/private';
import { APP_SLUG } from '$lib/brand';

import { runMigrations } from './migrations';

let db: DatabaseSync | null = null;

const DB_FILE = `${APP_SLUG}.db`;
const LEGACY_DB_FILE = 'hollama.db';

/**
 * Carry the database over from the name it had before the app was renamed.
 *
 * Without this, the rename would silently start a brand-new, empty database
 * beside the real one — every conversation still on disk, and none of them
 * visible. Runs once: after the rename the legacy file no longer exists.
 *
 * The `-wal` and `-shm` companions are moved too. SQLite can rebuild them, but
 * only from a matching database name; left behind next to a renamed file they
 * are at best confusing and at worst a lost final transaction.
 *
 * TODO (rename cleanup) — remove this once the Llooma rename release has been
 * out long enough that nobody upgrades across it any more. The three one-shot
 * migrations go together: this one, `#migrateLegacyKeys` in
 * `LocalStorageRepository`, and the legacy-key fallback in `src/app.html`. The
 * release that drops them MUST say in its notes which version to pin first, so
 * anyone still on an older build can pass through it before updating further.
 * The legacy *backup* keys in `data/keys.ts` are NOT part of this: an exported
 * file never ages out, so reading them stays forever.
 */
function adoptLegacyDatabase(dataDir: string): void {
	if (existsSync(join(dataDir, DB_FILE))) return;
	if (!existsSync(join(dataDir, LEGACY_DB_FILE))) return;

	for (const suffix of ['', '-wal', '-shm']) {
		const from = join(dataDir, LEGACY_DB_FILE + suffix);
		if (existsSync(from)) renameSync(from, join(dataDir, DB_FILE + suffix));
	}
	console.info(`Migrated ${LEGACY_DB_FILE} to ${DB_FILE}`);
}

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
	adoptLegacyDatabase(dataDir);

	const instance = new DatabaseSync(join(dataDir, DB_FILE));
	instance.exec('PRAGMA journal_mode = WAL');
	instance.exec('PRAGMA foreign_keys = ON');
	runMigrations(instance);

	db = instance;
	return db;
}
