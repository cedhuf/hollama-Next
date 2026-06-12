import type { Knowledge } from '$lib/knowledge';
import type { Persona } from '$lib/personas';
import type { Session } from '$lib/sessions';
import type { Settings } from '$lib/settings';

import { getDb } from './index';

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
		db.prepare('DELETE FROM knowledge WHERE user_id = ?').run(userId);
		db.prepare('DELETE FROM personas WHERE user_id = ?').run(userId);
		db.prepare('DELETE FROM settings WHERE user_id = ?').run(userId);
		db.exec('COMMIT');
	} catch (error) {
		db.exec('ROLLBACK');
		throw error;
	}
}
