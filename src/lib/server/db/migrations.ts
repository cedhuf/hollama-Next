import type { DatabaseSync } from 'node:sqlite';

import { adoptLegacyNotes } from '$lib/chat/legacyNotes';

interface Migration {
	version: number;
	/** Schema changes, which is what almost all of them are. */
	up?: string;
	/** A migration that has to read and rewrite stored JSON. SQLite can, with `json_group_array` over `json_each` and a `CASE` per field, and the result is a statement nobody can check by reading. Same transaction as `up`. */
	run?: (db: DatabaseSync) => void;
}

/** Ordered and append-only: never edit a past migration, add a new one. Applied inside a transaction and recorded in `schema_migrations`. */
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
		// Two fields become one, with the kind inside it. See `chat/notes` for why, and
		// `chat/legacyNotes` for the conversion, shared with the browser's own storage
		// so both sides cannot read the old shape differently.
		//
		// The markers table is rebuilt rather than migrated: it is derived data, the
		// expression that fills it has just changed, and re-deriving it is impossible to
		// get subtly wrong.
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
	},
	{
		version: 13,
		up: `
			-- An account's own period, when it is not the instance's.
			--
			-- Null means "whatever the instance says", the same answer its allowance
			-- gives: raising or shortening the instance's period should move everyone
			-- who never asked for anything else, and it cannot if inheriting were
			-- recorded as a value.
			ALTER TABLE users ADD COLUMN credit_period TEXT;
		`
	},
	{
		version: 14,
		up: `
			-- What a persona remembers about one person.
			--
			-- Keyed on the pair, not on the persona, and that is the whole design. A
			-- persona an admin shares is a single object every account reads: a memory
			-- stored on it would be one memory for the instance, which for something
			-- this personal is the wrong answer in the loudest possible way.
			--
			-- The account cascades: deleting it takes its memories with it. The
			-- persona deliberately does not, because a shared persona is not a row in
			-- the personas table at all, and a foreign key would make remembering one
			-- impossible. Memories of a persona nobody has any more are cleaned up
			-- with the persona itself.
			CREATE TABLE persona_memory (
				id         TEXT NOT NULL,                 -- the persona's id
				user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
				data       TEXT NOT NULL,                 -- JSON PersonaMemory
				updated_at TEXT NOT NULL,
				PRIMARY KEY (id, user_id)
			);
			CREATE INDEX idx_persona_memory_user ON persona_memory(user_id);
		`
	},
	{
		version: 15,
		/**
		 * Repair `persona_memory` on the databases that got the first draft of 14: its
		 * key column was renamed while 14 was being written, and a migration that has
		 * run never runs again, so a database created in between has the old column.
		 *
		 * Nothing is lost by rebuilding, since nothing could have been written through a
		 * column the code does not name. A no-op on a database that got 14 finished,
		 * which is why it checks the shape.
		 */
		run: (db) => {
			const columns = db.prepare('PRAGMA table_info(persona_memory)').all() as {
				name: string;
			}[];
			if (columns.some((column) => column.name === 'id')) return;

			db.exec(`
				DROP TABLE IF EXISTS persona_memory;
				CREATE TABLE persona_memory (
					id         TEXT NOT NULL,                 -- the persona's id
					user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
					data       TEXT NOT NULL,                 -- JSON PersonaMemory
					updated_at TEXT NOT NULL,
					PRIMARY KEY (id, user_id)
				);
				CREATE INDEX idx_persona_memory_user ON persona_memory(user_id);
			`);
		}
	},
	{
		version: 16,
		up: `
			-- What each model is for, sparse like the labels and the prices beside it.
			--
			-- A row only where somebody disagreed with the guess the name gives. No
			-- provider reports this: /v1/models returns ids and nothing else, and
			-- Ollama does not list image models at all, so the name is the only signal
			-- there is and it has to stay correctable.
			CREATE TABLE model_kinds (
				server_id  TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
				model_name TEXT NOT NULL,
				kind       TEXT NOT NULL,  -- 'text' | 'image' | 'embedding'
				PRIMARY KEY (server_id, model_name)
			);

			-- What a price is billed by, and the single figure every unit that is not
			-- tokens uses. NULL unit means tokens: every row written before this is a
			-- token price, and rewriting them all to say so would be a migration that
			-- changes nothing.
			ALTER TABLE model_pricing ADD COLUMN unit TEXT;
			ALTER TABLE model_pricing ADD COLUMN rate REAL;

			-- What a drawing consumed, which is not tokens.
			--
			-- Beside the token columns rather than instead of them, because the two
			-- are read together: a month that cost money with no tokens against it
			-- looks like a bug to whoever reads the card, and a month of images with
			-- no figure for them is the same hole the token counters were added to
			-- close.
			ALTER TABLE user_usage ADD COLUMN images INTEGER NOT NULL DEFAULT 0;
			ALTER TABLE user_usage ADD COLUMN seconds REAL NOT NULL DEFAULT 0;
		`
	},
	{
		version: 17,
		up: `
			-- Where a connection's image endpoints live, when that is not where its
			-- chat endpoint lives. NULL means the same base, which is every provider
			-- that serves both from one root.
			--
			-- One base URL was an assumption, not a fact: Infomaniak puts chat on API
			-- version 2 under /openai/v1 and images only on version 1 under /openai,
			-- and no path appended to the first reaches the second.
			ALTER TABLE servers ADD COLUMN image_base_url TEXT;
		`
	},
	{
		version: 18,
		up: `
			-- What the app has drawn, minus the drawings.
			--
			-- The bytes are files under DATA_DIR, not a column: a gallery has to list a
			-- hundred rows without carrying a hundred megabytes, and SQLite is a poor
			-- place to keep megabytes that are only ever read whole. What is here is
			-- the prompt, the model and the cost, which is small, searchable, and worth
			-- keeping after the picture itself is deleted.
			--
			-- The bytes column is real rather than a field inside the JSON because it
			-- is the one thing that gets summed: an account's quota is a SELECT SUM,
			-- and a quota that has to parse every row to be enforced is a quota that
			-- stops being enforced the day somebody has a thousand of them.
			CREATE TABLE generated_images (
				id         TEXT PRIMARY KEY,
				user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
				data       TEXT NOT NULL,          -- JSON GeneratedImage
				bytes      INTEGER NOT NULL DEFAULT 0,
				created_at TEXT NOT NULL
			);
			CREATE INDEX idx_generated_images_user ON generated_images(user_id, created_at DESC);
		`
	},
	{
		version: 19,
		up: `
			-- How this Ollama loads a model: threads, GPU layers, mmap and the rest.
			--
			-- One JSON column rather than ten, because nothing ever queries them: they
			-- are read whole when a request is built and written whole when somebody
			-- edits the connection. Ten columns would buy a WHERE clause nobody wants
			-- and cost a migration every time llama.cpp grows another knob.
			--
			-- A column rather than a side table for the same reason the base URL is a
			-- column: it is one small record per connection, not a map keyed by model
			-- like the labels and the prices.
			--
			-- NULL means nothing was set, which is what every existing row gets and is
			-- also what the app wants: an absent field lets Ollama decide, and deciding
			-- for it is exactly what the old per-conversation panel got wrong.
			ALTER TABLE servers ADD COLUMN load_options TEXT;
		`
	},
	{
		version: 20,
		up: `
			-- Bots that live on another chat server and answer with a model from here.
			--
			-- One table for every kind rather than one per service: what an integration
			-- is made of is a credential, an address and a handful of choices, and the
			-- part that differs between two services is the handful of choices. Those
			-- go in a JSON column, read through the normaliser in $lib/integrations, so
			-- adding a second service is a folder and a form rather than a migration.
			--
			-- The credential is encrypted with the instance secret, exactly like a
			-- provider key, and is never returned to a browser.
			CREATE TABLE integrations (
				id            TEXT PRIMARY KEY,
				owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
				kind          TEXT NOT NULL,
				label         TEXT,
				config        TEXT NOT NULL,        -- JSON, shaped by kind
				secret_enc    TEXT,
				is_enabled    INTEGER NOT NULL DEFAULT 1,
				created_at    TEXT NOT NULL
			);
			CREATE INDEX idx_integrations_owner ON integrations(owner_user_id, created_at);

			-- What has already been answered, so a restart does not answer it again.
			--
			-- The remote server hands out a latest-value list rather than a queue: the
			-- same activation can arrive on every poll, and it keeps arriving until it
			-- ages out. Nothing but a written record of what was handled stops the bot
			-- from replying to the same message for as long as it is running, and the
			-- record has to survive the process for the same reason.
			--
			-- Two keys per activation in practice, one for the occurrence and one for
			-- the message it points at, because one message can raise several causes.
			CREATE TABLE integration_seen (
				integration_id TEXT NOT NULL REFERENCES integrations(id) ON DELETE CASCADE,
				key            TEXT NOT NULL,
				seen_at        TEXT NOT NULL,
				PRIMARY KEY (integration_id, key)
			);
			CREATE INDEX idx_integration_seen_age ON integration_seen(integration_id, seen_at);
		`
	},
	{
		version: 21,
		up: `
			-- An administrator's suspension, kept apart from the owner's own switch.
			--
			-- They were one column, which made an administrator's decision something
			-- the owner undid by flipping their own switch back. Two states, because
			-- they answer two different questions: the owner says whether they want
			-- the bot running, the instance says whether it is allowed to. A bot runs
			-- when both agree, and neither can speak for the other.
			ALTER TABLE integrations ADD COLUMN blocked INTEGER NOT NULL DEFAULT 0;
		`
	},
	{
		version: 22,
		up: `
			-- Catalogues of tools living somewhere else, that a turn may call out to.
			--
			-- Flat columns rather than the JSON bag the integrations table uses, and
			-- the difference is that there is nothing to vary: one transport, HTTP
			-- streamable, so a server is an address and at most a bearer token. A
			-- second transport is not a column, it is a decision nobody has taken.
			--
			-- The token is encrypted with the instance secret, like a provider key,
			-- and never goes back to a browser.
			--
			-- The slug is what the server's tools are named after in front of the
			-- model, so it is stored rather than derived at call time: a rename must
			-- not silently point the dispatch at nothing. Unique per owner, because
			-- two servers with the same slug would offer the same tool names.
			CREATE TABLE mcp_servers (
				id            TEXT PRIMARY KEY,
				owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
				label         TEXT NOT NULL,
				slug          TEXT NOT NULL,
				url           TEXT NOT NULL,
				secret_enc    TEXT,
				is_enabled    INTEGER NOT NULL DEFAULT 1,
				blocked       INTEGER NOT NULL DEFAULT 0,
				created_at    TEXT NOT NULL
			);
			CREATE INDEX idx_mcp_servers_owner ON mcp_servers(owner_user_id, created_at);
			CREATE UNIQUE INDEX idx_mcp_servers_slug ON mcp_servers(owner_user_id, slug);
		`
	},
	{
		version: 23,
		up: `
			-- The catalogue a server answered with, and when it said so.
			--
			-- Kept rather than fetched on sight, because the question people have in
			-- the settings is "what does this thing give me", and answering it used to
			-- mean opening a connection to somebody's machine every time the tab was
			-- opened. A stored list is also the only way the total across servers can
			-- be shown at all, since the tab would otherwise have to reach every one
			-- of them to count.
			--
			-- Names only: the descriptions and the schemas are read at the start of
			-- each turn from the server itself, which is where they have to come from
			-- anyway. This is what the settings display and nothing else, so a stale
			-- copy is a list that is out of date, never a call made against one.
			ALTER TABLE mcp_servers ADD COLUMN tools TEXT;
			ALTER TABLE mcp_servers ADD COLUMN tools_at TEXT;
		`
	},
	{
		version: 24,
		up: `
			-- The groups this account has switched off, by name.
			--
			-- Groups rather than tools, because behind a gateway a group *is* a server:
			-- all of the house or none of it is the choice people actually make, and
			-- thirty checkboxes to express it is a worse way of saying the same thing.
			--
			-- The refused ones rather than the kept ones, and the difference is what
			-- happens to a tool that appears afterwards: added to a group that is on it
			-- is offered, added to one that is off it is not. A list of kept tools would
			-- have let every addition a gateway makes in, silently.
			ALTER TABLE mcp_servers ADD COLUMN disabled_groups TEXT;
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
