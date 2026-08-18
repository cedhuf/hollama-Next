import { emptyMemory, type PersonaMemory } from '$lib/personaMemory';

import { getDb } from './index';

/**
 * One person's memory of one persona.
 *
 * Every function here takes the pair. There is deliberately no "get the memory
 * for this persona" overload: the missing argument would have to default to
 * something, and every plausible default is a way of showing one account another
 * account's memory.
 */
export function getPersonaMemory(userId: string, personaId: string): PersonaMemory | null {
	const row = getDb()
		.prepare('SELECT data FROM persona_memory WHERE id = ? AND user_id = ?')
		.get(personaId, userId) as { data: string } | undefined;
	if (!row) return null;
	try {
		return JSON.parse(row.data) as PersonaMemory;
	} catch {
		return null;
	}
}

/** Every memory this account holds, for the backup and for a wholesale restore. */
export function getAllPersonaMemory(userId: string): PersonaMemory[] {
	const rows = getDb()
		.prepare('SELECT data FROM persona_memory WHERE user_id = ? ORDER BY updated_at DESC')
		.all(userId) as { data: string }[];
	const out: PersonaMemory[] = [];
	for (const row of rows) {
		try {
			out.push(JSON.parse(row.data) as PersonaMemory);
		} catch {
			/* one unreadable row must not cost the others */
		}
	}
	return out;
}

export function savePersonaMemory(userId: string, memory: PersonaMemory): void {
	getDb()
		.prepare(
			`INSERT INTO persona_memory (id, user_id, data, updated_at) VALUES (?, ?, ?, ?)
			 ON CONFLICT(id, user_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`
		)
		.run(memory.id, userId, JSON.stringify(memory), memory.updatedAt);
}

export function deletePersonaMemory(userId: string, personaId: string): void {
	getDb().prepare('DELETE FROM persona_memory WHERE id = ? AND user_id = ?').run(personaId, userId);
}

export function replacePersonaMemory(userId: string, memories: PersonaMemory[]): void {
	const db = getDb();
	db.exec('BEGIN');
	try {
		db.prepare('DELETE FROM persona_memory WHERE user_id = ?').run(userId);
		for (const memory of memories) {
			if (!memory?.id) continue;
			savePersonaMemory(userId, { ...emptyMemory(memory.id), ...memory });
		}
		db.exec('COMMIT');
	} catch (e) {
		db.exec('ROLLBACK');
		throw e;
	}
}
