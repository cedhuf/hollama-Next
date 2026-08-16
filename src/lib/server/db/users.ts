import { randomUUID } from 'node:crypto';

import { getDb } from './index';

export type Role = 'admin' | 'user';

export interface UserRow {
	id: string;
	email: string;
	password_hash: string | null;
	role: Role;
	profile: string; // JSON
	created_at: string;
	/** Last request this account made, to the minute it was written. Null: never seen. */
	last_seen_at: string | null;
}

export function getUserByEmail(email: string): UserRow | undefined {
	return getDb().prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase()) as
		| UserRow
		| undefined;
}

export function getUserById(id: string): UserRow | undefined {
	return getDb().prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow | undefined;
}

export function countUsers(): number {
	return (getDb().prepare('SELECT count(*) AS count FROM users').get() as { count: number }).count;
}

export function createUser(input: {
	email: string;
	role: Role;
	passwordHash?: string | null;
	profile?: Record<string, unknown>;
}): UserRow {
	const id = randomUUID();
	getDb()
		.prepare(
			'INSERT INTO users (id, email, password_hash, role, profile, created_at) VALUES (?, ?, ?, ?, ?, ?)'
		)
		.run(
			id,
			input.email.toLowerCase(),
			input.passwordHash ?? null,
			input.role,
			JSON.stringify(input.profile ?? {}),
			new Date().toISOString()
		);
	return getUserById(id)!;
}

export function setUserRole(id: string, role: Role): void {
	getDb().prepare('UPDATE users SET role = ? WHERE id = ?').run(role, id);
}

export type UserSummary = Pick<UserRow, 'id' | 'email' | 'role' | 'created_at' | 'last_seen_at'>;

export function listUsers(): UserSummary[] {
	return getDb()
		.prepare('SELECT id, email, role, created_at, last_seen_at FROM users ORDER BY created_at')
		.all() as unknown as UserSummary[];
}

/**
 * Note that an account is around, at most once every few minutes.
 *
 * Called from the one place that answers "who is this", so it cannot be
 * forgotten on a route. It is therefore called on every authenticated request,
 * and a conversation makes several a second: a write each time, to store a value
 * that is only ever read to the hour, would be the most expensive thing on the
 * page.
 *
 * So it is throttled twice, and the two do different jobs.
 *
 * In memory, which is the fast path: the common request does not reach SQLite at
 * all. It is per process and per user, which is why it is not the whole answer.
 *
 * And in the statement itself, which is the correct one: the row is only written
 * when what it holds is genuinely older than the window. That makes a restart
 * cost nothing rather than one spurious write per user, and it makes two
 * processes agree without knowing about each other, which the map cannot do.
 * A no-op update touches no page.
 */
const TOUCH_EVERY_MS = 5 * 60 * 1000;
const touched = new Map<string, number>();

export function touchLastSeen(id: string): void {
	const now = Date.now();
	if (now - (touched.get(id) ?? 0) < TOUCH_EVERY_MS) return;
	touched.set(id, now);

	getDb()
		.prepare(
			`UPDATE users SET last_seen_at = ?
			 WHERE id = ? AND (last_seen_at IS NULL OR last_seen_at < ?)`
		)
		.run(new Date(now).toISOString(), id, new Date(now - TOUCH_EVERY_MS).toISOString());
}

export function deleteUser(id: string): void {
	getDb().prepare('DELETE FROM users WHERE id = ?').run(id);
}
