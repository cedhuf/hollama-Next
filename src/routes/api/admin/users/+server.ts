import { error, json } from '@sveltejs/kit';

import { requireAdmin } from '$lib/server/api';
import { hashPassword } from '$lib/server/auth/password';
import { createUser, getUserByEmail, listUsers } from '$lib/server/db/users';

export async function GET(event) {
	await requireAdmin(event);
	return json(listUsers());
}

export async function POST(event) {
	await requireAdmin(event);
	const body = await event.request.json();

	const email = String(body?.email ?? '')
		.trim()
		.toLowerCase();
	const password = String(body?.password ?? '');
	const role = body?.role === 'admin' ? 'admin' : 'user';

	if (!email || !password) throw error(400, 'email and password are required');
	if (getUserByEmail(email)) throw error(409, 'A user with this email already exists');

	const user = createUser({ email, role, passwordHash: await hashPassword(password) });
	return json({ id: user.id, email: user.email, role: user.role }, { status: 201 });
}
