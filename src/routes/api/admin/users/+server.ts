import { error, json } from '@sveltejs/kit';

import { requireAdmin } from '$lib/server/api';
import { hashPassword } from '$lib/server/auth/password';
import { creditPeriod, instanceCreditLimit, periodStart, spendForAll } from '$lib/server/db/usage';
import { createUser, getUserByEmail, listUsers } from '$lib/server/db/users';

/**
 * Every account, with what it has spent this period and what it is allowed.
 *
 * The spend is joined here rather than fetched per row: a list of twenty
 * accounts should be one query, not twenty, and the figure is only ever read
 * alongside the account it belongs to.
 */
export async function GET(event) {
	await requireAdmin(event);

	const period = creditPeriod();
	const from = periodStart(period);
	const spend = spendForAll(from);
	const fallback = instanceCreditLimit();

	return json({
		period,
		from,
		instanceLimit: fallback,
		users: listUsers().map((user) => ({
			...user,
			// `null` is "whatever the instance says", which is a different answer from
			// a limit that happens to equal it, and the field has to say which.
			effectiveLimit: user.credit_limit ?? fallback,
			spend: spend[user.id] ?? { inputTokens: 0, outputTokens: 0, cost: 0 }
		}))
	});
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
