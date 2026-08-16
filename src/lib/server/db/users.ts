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
 * forgotten on a route. Throttled in memory because it is called on every
 * authenticated request, and a chat writes several a second: to the minute is
 * all a "last seen" column is worth, and a write per request to store it would
 * be the most expensive thing on the page.
 *
 * The throttle is per process and per user, so a restart costs one extra write.
 */
const TOUCH_EVERY_MS = 5 * 60 * 1000;
const touched = new Map<string, number>();

export function touchLastSeen(id: string): void {
	const now = Date.now();
	const last = touched.get(id) ?? 0;
	if (now - last < TOUCH_EVERY_MS) return;
	touched.set(id, now);

	getDb()
		.prepare('UPDATE users SET last_seen_at = ? WHERE id = ?')
		.run(new Date(now).toISOString(), id);
}

export function deleteUser(id: string): void {
	getDb().prepare('DELETE FROM users WHERE id = ?').run(id);
}
