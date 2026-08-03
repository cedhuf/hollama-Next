import type { Knowledge } from '$lib/knowledge';
import type { Persona } from '$lib/personas';
import type { Session } from '$lib/sessions';
import { summarizeSession, type SessionSummary } from '$lib/sessionShape';
import type { Settings } from '$lib/settings';

import { getDb } from './index';
import { dropSessionFromIndex, reindexAllSessions, reindexSession } from './search';

type CollectionTable = 'sessions' | 'knowledge' | 'personas';

/**
 * Write one row, leaving every other row alone.
 *
 * This is what a save actually is. Replacing the whole collection made the cost
 * of writing a message grow with the entire history, and let any client holding
 * a stale list delete what the others had added — the wholesale path below is
 * now reserved for restoring a backup.
 */
export function upsertItem(
	table: CollectionTable,
	userId: string,
	item: { id: string; updatedAt?: string }
): void {
	// `id` is a global primary key, not scoped per user, so the conflict clause has
	// to check the owner: without it, writing a guessed id would overwrite another
	// user's row. A mismatch updates nothing rather than raising — the caller has
	// no business knowing whether that id exists elsewhere.
	getDb()
		.prepare(
			`INSERT INTO ${table} (id, user_id, data, updated_at) VALUES (?, ?, ?, ?)
			 ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at
			 WHERE ${table}.user_id = excluded.user_id`
		)
		.run(item.id, userId, JSON.stringify(item), item.updatedAt ?? new Date().toISOString());

	if (table === 'sessions') reindexSession(userId, item.id);
}

/** Delete one row, scoped to its owner so an id alone can't reach another user's. */
export function deleteItem(table: CollectionTable, userId: string, id: string): void {
	getDb().prepare(`DELETE FROM ${table} WHERE id = ? AND user_id = ?`).run(id, userId);
	if (table === 'sessions') dropSessionFromIndex(id);
}

/** Replace every row of a per-user JSON collection in one transaction. */
function replaceCollection(
	table: 'sessions' | 'knowledge' | 'personas',
	userId: string,
	items: { id: string; updatedAt?: string }[]
): void {
	const db = getDb();
	db.exec('BEGIN');
	try {
		db.prepare(`DELETE FROM ${table} WHERE user_id = ?`).run(userId);
		const insert = db.prepare(
			`INSERT INTO ${table} (id, user_id, data, updated_at) VALUES (?, ?, ?, ?)`
		);
		for (const item of items) {
			insert.run(item.id, userId, JSON.stringify(item), item.updatedAt ?? new Date().toISOString());
		}
		db.exec('COMMIT');
	} catch (error) {
		db.exec('ROLLBACK');
		throw error;
	}

	// Restoring a backup swaps out every conversation at once; the index has to
	// follow, or search would keep answering with what was there before.
	if (table === 'sessions') reindexAllSessions(userId);
}

/** One item, scoped to its owner. `null` when it doesn't exist — or isn't theirs. */
export function getItem<T>(table: CollectionTable, userId: string, id: string): T | null {
	const row = getDb()
		.prepare(`SELECT data FROM ${table} WHERE id = ? AND user_id = ?`)
		.get(id, userId) as { data: string } | undefined;
	return row ? (JSON.parse(row.data) as T) : null;
}

/**
 * The conversation list, without the conversations.
 *
 * Every field the sidebar and the home page read, and none of the messages —
 * which is the whole point: this response used to carry the entire history on
 * every boot and every return to the foreground.
 */
export function getSessionSummaries(userId: string): SessionSummary[] {
	return readCollection<Session>('sessions', userId).map(summarizeSession);
}

function readCollection<T>(table: 'sessions' | 'knowledge' | 'personas', userId: string): T[] {
	const rows = getDb()
		.prepare(`SELECT data FROM ${table} WHERE user_id = ? ORDER BY updated_at DESC`)
		.all(userId) as { data: string }[];
	return rows.map((row) => JSON.parse(row.data) as T);
}

export const getSessions = (userId: string): Session[] =>
	readCollection<Session>('sessions', userId);
export const replaceSessions = (userId: string, sessions: Session[]): void =>
	replaceCollection('sessions', userId, sessions);

export const getKnowledge = (userId: string): Knowledge[] =>
	readCollection<Knowledge>('knowledge', userId);
export const replaceKnowledge = (userId: string, knowledge: Knowledge[]): void =>
	replaceCollection('knowledge', userId, knowledge);

export const getPersonas = (userId: string): Persona[] =>
	readCollection<Persona>('personas', userId);
export const replacePersonas = (userId: string, personas: Persona[]): void =>
	replaceCollection('personas', userId, personas);

export function getSettings(userId: string): Settings | null {
	const row = getDb().prepare('SELECT data FROM settings WHERE user_id = ?').get(userId) as
		| { data: string }
		| undefined;
	return row ? (JSON.parse(row.data) as Settings) : null;
}

export function replaceSettings(userId: string, settings: Settings): void {
	getDb()
		.prepare(
			`INSERT INTO settings (user_id, data) VALUES (?, ?)
			 ON CONFLICT(user_id) DO UPDATE SET data = excluded.data`
		)
		.run(userId, JSON.stringify(settings));
}

/** Wipe a user's own data (sessions, knowledge, personas, settings). */
export function resetUserData(userId: string): void {
	const db = getDb();
	db.exec('BEGIN');
	try {
		db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
		db.prepare('DELETE FROM sessions_fts WHERE user_id = ?').run(userId);
		db.prepare('DELETE FROM knowledge WHERE user_id = ?').run(userId);
		db.prepare('DELETE FROM personas WHERE user_id = ?').run(userId);
		db.prepare('DELETE FROM settings WHERE user_id = ?').run(userId);
		db.exec('COMMIT');
	} catch (error) {
		db.exec('ROLLBACK');
		throw error;
	}
}
