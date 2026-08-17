import type { DatabaseSync } from 'node:sqlite';

import { adoptLegacyNotes } from '$lib/chat/legacyNotes';

interface Migration {
	version: number;
	/** Schema changes, which is what almost all of them are. */
	up?: string;
	/**
	 * A migration that has to read and rewrite stored JSON.
	 *
	 * SQLite can do it, with `json_group_array` over `json_each` and a `CASE` per
	 * field, and the result is a statement nobody can check by reading. These run
	 * inside the same transaction as `up`, so the choice costs nothing but
	 * legibility, and legibility is the whole reason to prefer it.
	 */
	run?: (db: DatabaseSync) => void;
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
	},
	{
		version: 5,
		up: `
			-- Display-only names for models, sparse: a row only where one was set.
			CREATE TABLE model_labels (
				server_id  TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
				model_name TEXT NOT NULL,
				label      TEXT NOT NULL,
				PRIMARY KEY (server_id, model_name)
			);
		`
	},
	{
		version: 6,
		up: `
			-- Full-text index over message content: one row per message, so a
			-- conversation that mentions a term eight times yields eight entry points
			-- rather than one. Only 'content' is indexed; the rest is carried along to
			-- avoid a join back for the common case.
			CREATE VIRTUAL TABLE sessions_fts USING fts5(
				content,
				session_id    UNINDEXED,
				user_id       UNINDEXED,
				message_index UNINDEXED,
				role          UNINDEXED
			);

			-- Backfill what already exists. json_each walks the messages array inside
			-- the stored JSON, so the extraction is expressed once, in SQL, and the
			-- incremental reindex below reuses the very same statement.
			INSERT INTO sessions_fts (content, session_id, user_id, message_index, role)
			SELECT json_extract(m.value, '$.content'),
			       s.id,
			       s.user_id,
			       m.key,
			       json_extract(m.value, '$.role')
			FROM sessions s, json_each(s.data, '$.messages') m
			WHERE json_extract(m.value, '$.content') IS NOT NULL
			  AND json_extract(m.value, '$.content') <> '';
		`
	},
	{
		version: 7,
		up: `
			-- Where a conversation's context was cut, extracted once per write.
			--
			-- Search needs to know which hits are behind a clear or are a compaction
			-- summary, and it was asking by unfolding every matched conversation's
			-- messages array with json_each, at query time, on every keystroke. That is
			-- megabytes of JSON reparsed to answer a question about a handful of
			-- integers. Here the answer is written when the conversation is, which is
			-- the direction the arrow should point: rarely written, constantly read.
			CREATE TABLE session_markers (
				session_id    TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
				user_id       TEXT NOT NULL,
				message_index INTEGER NOT NULL,
				kind          TEXT NOT NULL, -- 'cleared' | 'compaction'
				PRIMARY KEY (session_id, message_index)
			);

			CREATE INDEX idx_session_markers_session ON session_markers(session_id);

			-- Backfill from the same expression the incremental write uses, so the two
			-- cannot describe different things.
			INSERT INTO session_markers (session_id, user_id, message_index, kind)
			SELECT s.id,
			       s.user_id,
			       m.key,
			       CASE WHEN json_extract(m.value, '$.cleared') IS NOT NULL
			            THEN 'cleared' ELSE 'compaction' END
			FROM sessions s, json_each(s.data, '$.messages') m
			WHERE json_extract(m.value, '$.cleared') IS NOT NULL
			   OR json_extract(m.value, '$.compaction') IS NOT NULL;
		`
	},
	{
		version: 8,
		up: `
			-- When each account was last seen, for the administrator's user list.
			--
			-- Nullable and left null on existing rows rather than backfilled with the
			-- creation date: an account nobody has opened since this shipped has not
			-- been seen, and saying "created three months ago" in a column headed "last
			-- seen" would be a plausible lie, which is worse than a blank.
			ALTER TABLE users ADD COLUMN last_seen_at TEXT;
		`
	},
	{
		version: 9,
		// Two fields become one, with the kind inside it. See `chat/notes` for why,
		// and `chat/legacyNotes` for the conversion itself, which is shared with the
		// browser's own storage so both sides cannot read the old shape differently.
		//
		// The markers table is rebuilt afterwards rather than migrated: it is derived
		// data, the expression that fills it has just changed, and re-deriving it is
		// both shorter and impossible to get subtly wrong.
		run: (db) => {
			const rows = db.prepare('SELECT id, data FROM sessions').all() as {
				id: string;
				data: string;
			}[];
			const update = db.prepare('UPDATE sessions SET data = ? WHERE id = ?');

			for (const row of rows) {
				const session = JSON.parse(row.data) as { messages?: [] };
				if (adoptLegacyNotes([session]) === 0) continue;
				update.run(JSON.stringify(session), row.id);
			}

			db.exec('DELETE FROM session_markers');
			db.exec(`
				INSERT INTO session_markers (session_id, user_id, message_index, kind)
				SELECT s.id, s.user_id, m.key, json_extract(m.value, '$.note.kind')
				FROM sessions s, json_each(s.data, '$.messages') m
				WHERE json_extract(m.value, '$.note.kind') IN ('cleared', 'compaction')
			`);
		}
	},
	{
		version: 10,
		up: `
			-- Playbooks: a procedure written once and switched on in any conversation.
			-- Same shape as the personas table because it is the same kind of thing to
			-- the database, a per-user JSON collection, and the accessors are shared.
			CREATE TABLE playbooks (
				id         TEXT PRIMARY KEY,
				user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
				data       TEXT NOT NULL,                 -- JSON Playbook
				updated_at TEXT NOT NULL
			);
			CREATE INDEX idx_playbooks_user ON playbooks(user_id);
		`
	},
	{
		version: 11,
		up: `
			-- What a million tokens costs, sparse like the labels beside it: a row only
			-- where somebody has actually given a figure. Absent is not free, and the
			-- difference matters: an unpriced model is not counted at all, rather than
			-- counted as costing nothing, or a model nobody got round to pricing would
			-- let somebody run for ever without ever reaching a limit.
			CREATE TABLE model_pricing (
				server_id  TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
				model_name TEXT NOT NULL,
				input      REAL,
				output     REAL,
				PRIMARY KEY (server_id, model_name)
			);

			-- What each provider bills in. On the connection because that is where it
			-- is true, and because the app converts nothing.
			ALTER TABLE servers ADD COLUMN currency TEXT;

			-- What each account has spent, by day.
			--
			-- By day rather than by the period being enforced, so the period stays a
			-- question asked at read time. An administrator switching from monthly to
			-- weekly then gets a weekly figure for the weeks that have already
			-- happened, instead of a counter that starts again at zero and a month of
			-- history that means nothing.
			CREATE TABLE user_usage (
				user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
				day           TEXT NOT NULL, -- YYYY-MM-DD, UTC
				input_tokens  INTEGER NOT NULL DEFAULT 0,
				output_tokens INTEGER NOT NULL DEFAULT 0,
				cost          REAL NOT NULL DEFAULT 0,
				PRIMARY KEY (user_id, day)
			);

			-- Null means "whatever the instance says". Zero means no limit, which is
			-- also the instance default, so nothing changes for anyone until an
			-- administrator decides otherwise.
			ALTER TABLE users ADD COLUMN credit_limit REAL;
		`
	},
	{
		version: 12,
		up: `
			-- What one model is billed in, when it differs from its connection's.
			-- Kept per model rather than only per connection because a single account
			-- can be billed in more than one currency, and because a total that adds
			-- currencies together has to at least know it is doing it.
			ALTER TABLE model_pricing ADD COLUMN currency TEXT;
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
			if (migration.up) db.exec(migration.up);
			migration.run?.(db);
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
