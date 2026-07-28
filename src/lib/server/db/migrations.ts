import type { DatabaseSync } from 'node:sqlite';

interface Migration {
	version: number;
	up: string;
}

/**
 * Ordered, append-only list of schema migrations. Never edit a past migration —
 * add a new one. Applied inside a transaction and recorded in
 * `schema_migrations`.
 */
const migrations: Migration[] = [
	{
		version: 1,
		up: `
			CREATE TABLE users (
				id            TEXT PRIMARY KEY,
				email         TEXT NOT NULL UNIQUE,
				password_hash TEXT,                       -- NULL for OIDC-only accounts
				role          TEXT NOT NULL DEFAULT 'user',
				profile       TEXT NOT NULL DEFAULT '{}', -- JSON: firstName, lastName, avatar, color
				created_at    TEXT NOT NULL
			);

			CREATE TABLE servers (
				id              TEXT PRIMARY KEY,
				owner_user_id   TEXT REFERENCES users(id) ON DELETE CASCADE, -- NULL = system/admin-shared
				connection_type TEXT NOT NULL,
				base_url        TEXT NOT NULL,
				api_key_enc     TEXT,                     -- encrypted at rest; never sent to the client
				label           TEXT,
				model_filter    TEXT,
				is_enabled      INTEGER NOT NULL DEFAULT 0,
				created_at      TEXT NOT NULL
			);
			CREATE INDEX idx_servers_owner ON servers(owner_user_id);

			CREATE TABLE shared_models (
				server_id  TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
				model_name TEXT NOT NULL,
				PRIMARY KEY (server_id, model_name)
			);

			CREATE TABLE sessions (
				id         TEXT PRIMARY KEY,
				user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
				data       TEXT NOT NULL,                 -- JSON Session
				updated_at TEXT NOT NULL
			);
			CREATE INDEX idx_sessions_user ON sessions(user_id);

			CREATE TABLE knowledge (
				id         TEXT PRIMARY KEY,
				user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
				data       TEXT NOT NULL,                 -- JSON Knowledge
				updated_at TEXT NOT NULL
			);
			CREATE INDEX idx_knowledge_user ON knowledge(user_id);

			CREATE TABLE settings (
				user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
				data    TEXT NOT NULL                     -- JSON per-user preferences
			);

			-- Global admin flags (e.g. allowUserKeys), as a simple KV store.
			CREATE TABLE app_config (
				key   TEXT PRIMARY KEY,
				value TEXT NOT NULL
			);
		`
	},
	{
		version: 2,
		up: `
			CREATE TABLE personas (
				id         TEXT PRIMARY KEY,
				user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
				data       TEXT NOT NULL,                 -- JSON Persona
				updated_at TEXT NOT NULL
			);
			CREATE INDEX idx_personas_user ON personas(user_id);
		`
	},
	{
		version: 3,
		up: `
			-- When the connection was last synced successfully. NULL = never verified.
			ALTER TABLE servers ADD COLUMN verified_at TEXT;
		`
	},
	{
		version: 4,
		up: `
			-- Badge colour override; NULL falls back to the provider default.
			ALTER TABLE servers ADD COLUMN color TEXT;
		`
	}
];

/** Apply every pending migration, in order, each in its own transaction. */
export function runMigrations(db: DatabaseSync): void {
	db.exec(
		`CREATE TABLE IF NOT EXISTS schema_migrations (
			version    INTEGER PRIMARY KEY,
			applied_at TEXT NOT NULL
		)`
	);

	const row = db.prepare('SELECT MAX(version) AS version FROM schema_migrations').get() as {
		version: number | null;
	};
	const current = row?.version ?? 0;

	for (const migration of migrations) {
		if (migration.version <= current) continue;

		db.exec('BEGIN');
		try {
			db.exec(migration.up);
			db.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)').run(
				migration.version,
				new Date().toISOString()
			);
			db.exec('COMMIT');
		} catch (error) {
			db.exec('ROLLBACK');
			throw error;
		}
	}
}
