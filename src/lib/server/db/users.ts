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
	/** Null means "whatever the instance says", which differs from a figure that happens to equal it: raising the instance's allowance should raise theirs. */
	credit_limit: number | null;
	/** This account's own period, or null to follow the instance's. */
	credit_period: string | null;
}

export function getUserByEmail(email: string): UserRow | undefined {
	return getDb().prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase()) as
		UserRow | undefined;
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

export type UserSummary = Pick<
	UserRow,
	'id' | 'email' | 'role' | 'created_at' | 'last_seen_at' | 'credit_limit' | 'credit_period'
>;

export function listUsers(): UserSummary[] {
	return getDb()
		.prepare(
			`SELECT id, email, role, created_at, last_seen_at, credit_limit, credit_period
			 FROM users ORDER BY created_at`
		)
		.all() as unknown as UserSummary[];
}

/**
 * Note that an account is around, at most once every few minutes. Called from
 * the one place that answers "who is this", so it cannot be forgotten on a
 * route, which also means every authenticated request.
 *
 * Throttled twice. In memory is the fast path, but per process. In the statement
 * itself is the correct one: the row is written only when what it holds is
 * older than the window, so two processes agree without knowing about each other.
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

/** The first admin by creation date, which is the account an instance was bootstrapped with. One address rather than all of them: a person to write to, not a list to publish. */
export function adminContact(): string | null {
	return getFirstAdmin()?.email ?? null;
}

/** Also the account an instance with no accounts runs as, which is why it is a whole row: turning a login method off has to hand the owner their own data back. */
export function getFirstAdmin(): UserRow | undefined {
	return getDb()
		.prepare("SELECT * FROM users WHERE role = 'admin' ORDER BY created_at LIMIT 1")
		.get() as UserRow | undefined;
}
