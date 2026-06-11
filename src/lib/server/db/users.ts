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
