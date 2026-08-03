import { MATCH_CLOSE, MATCH_OPEN } from '$lib/conversationSearch';

import { getDb } from './index';

/**
 * Full-text search over message content, backed by SQLite's FTS5 index
 * (`sessions_fts`, created in migration 6).
 *
 * Everything that knows about that index lives here: how it is filled, how it is
 * kept in step with the stored conversations, and how it is queried.
 */

export interface SearchHit {
	sessionId: string;
	messageIndex: number;
	role: string;
	/** The surrounding text, with each match wrapped in the sentinels above. */
	excerpt: string;
}

/**
 * Rebuild a conversation's entries in the index.
 *
 * Reads back from the row that was just written rather than from the object in
 * hand: the extraction then lives in exactly one place — this statement and the
 * backfill in migration 6 are the same SELECT — so the index cannot drift from
 * what the stored data actually contains.
 */
export function reindexSession(userId: string, sessionId: string): void {
	const db = getDb();
	db.prepare('DELETE FROM sessions_fts WHERE session_id = ?').run(sessionId);
	db.prepare(
		`INSERT INTO sessions_fts (content, session_id, user_id, message_index, role)
		 SELECT json_extract(m.value, '$.content'), s.id, s.user_id, m.key,
		        json_extract(m.value, '$.role')
		 FROM sessions s, json_each(s.data, '$.messages') m
		 WHERE s.id = ? AND s.user_id = ?
		   AND json_extract(m.value, '$.content') IS NOT NULL
		   AND json_extract(m.value, '$.content') <> ''`
	).run(sessionId, userId);
}

export function dropSessionFromIndex(sessionId: string): void {
	getDb().prepare('DELETE FROM sessions_fts WHERE session_id = ?').run(sessionId);
}

/** Rebuild every conversation of one user — after restoring a backup. */
export function reindexAllSessions(userId: string): void {
	const db = getDb();
	db.prepare('DELETE FROM sessions_fts WHERE user_id = ?').run(userId);
	db.prepare(
		`INSERT INTO sessions_fts (content, session_id, user_id, message_index, role)
		 SELECT json_extract(m.value, '$.content'), s.id, s.user_id, m.key,
		        json_extract(m.value, '$.role')
		 FROM sessions s, json_each(s.data, '$.messages') m
		 WHERE s.user_id = ?
		   AND json_extract(m.value, '$.content') IS NOT NULL
		   AND json_extract(m.value, '$.content') <> ''`
	).run(userId);
}

/**
 * Turn what the user typed into an FTS5 expression.
 *
 * The raw string cannot go through as-is: `-`, `*`, `"`, `NEAR` and `OR` are
 * operators there, so a quote or a stray dash turns a search into a syntax
 * error. Each word is quoted as a literal (doubling any inner quote, FTS5's own
 * escape), which also makes the words implicitly AND-ed. The last one gets a
 * prefix `*` so results narrow while still typing.
 */
export function toMatchExpression(query: string): string | null {
	const words = query
		.trim()
		.split(/\s+/)
		.filter(Boolean)
		.map((word) => `"${word.replace(/"/g, '""')}"`);

	if (!words.length) return null;
	return [...words.slice(0, -1), `${words[words.length - 1]}*`].join(' ');
}

/**
 * Matching messages, best first.
 *
 * `rank` is FTS5's relevance ordering (more distinctive terms, closer together,
 * in shorter messages, score higher) — the caller groups by conversation while
 * keeping this order.
 */
export function searchSessions(userId: string, query: string, limit = 100): SearchHit[] {
	const match = toMatchExpression(query);
	if (!match) return [];

	const rows = getDb()
		.prepare(
			`SELECT session_id, message_index, role,
			        snippet(sessions_fts, 0, ?, ?, '…', 15) AS excerpt
			 FROM sessions_fts
			 WHERE sessions_fts MATCH ? AND user_id = ?
			 ORDER BY rank
			 LIMIT ?`
		)
		.all(MATCH_OPEN, MATCH_CLOSE, match, userId, limit) as {
		session_id: string;
		message_index: number;
		role: string;
		excerpt: string;
	}[];

	return rows.map((row) => ({
		sessionId: row.session_id,
		messageIndex: row.message_index,
		role: row.role,
		excerpt: row.excerpt
	}));
}

/** Longest title derived from a first message. Mirrors `getSessionTitle`. */
const MAX_TITLE_LENGTH = 56;

export interface SessionHeader {
	title: string;
	updatedAt?: string;
}

/**
 * Titles and dates for the conversations a search matched.
 *
 * Resolved here rather than left to the client: the same fallback to the first
 * user message that `getSessionTitle` applies has to happen somewhere, and once
 * conversations load lazily the client no longer holds the messages to derive it
 * from.
 */
export function getSessionHeaders(userId: string, ids: string[]): Map<string, SessionHeader> {
	const headers = new Map<string, SessionHeader>();
	if (!ids.length) return headers;

	const rows = getDb()
		.prepare(
			`SELECT id, data FROM sessions
			 WHERE user_id = ? AND id IN (${ids.map(() => '?').join(',')})`
		)
		.all(userId, ...ids) as { id: string; data: string }[];

	for (const row of rows) {
		const session = JSON.parse(row.data) as {
			title?: string;
			updatedAt?: string;
			messages?: { role: string; content?: string; knowledge?: unknown }[];
		};
		const firstUserMessage = session.messages?.find(
			(message) => message.role === 'user' && message.content && !message.knowledge
		);
		headers.set(row.id, {
			title: session.title || (firstUserMessage?.content ?? '').slice(0, MAX_TITLE_LENGTH),
			updatedAt: session.updatedAt
		});
	}

	return headers;
}
