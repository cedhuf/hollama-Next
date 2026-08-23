import { error, json } from '@sveltejs/kit';

import { requireAdmin } from '$lib/server/api';
import { hashPassword } from '$lib/server/auth/password';
import { unpricedSharedModels } from '$lib/server/db/servers';
import {
	creditPeriod,
	instanceCreditLimit,
	periodStart,
	spendForAll,
	spendSince
} from '$lib/server/db/usage';
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
	// Each account is summed over its own period, since it may not be the
	// instance's; the shared query would otherwise report a month of spend against
	// somebody's daily allowance.
	const from = periodStart(period);
	const spend = spendForAll(from);
	const fallback = instanceCreditLimit();

	/**
	 * Shared models with no price, but only when a limit is actually in force.
	 *
	 * With no limit anywhere, an unpriced model is simply uncounted and nothing is
	 * wrong. The moment one account has an allowance, the same model becomes a way
	 * around it, and the relay refuses it, so this list is also the list of what
	 * has stopped working and why.
	 */
	const users = listUsers();
	const limited = fallback > 0 || users.some((user) => (user.credit_limit ?? 0) > 0);
	const unpriced = limited ? unpricedSharedModels() : [];

	return json({
		period,
		from,
		instanceLimit: fallback,
		unpriced,
		users: users.map((user) => ({
			...user,
			// `null` is "whatever the instance says", which is a different answer from
			// a limit that happens to equal it, and the field has to say which.
			effectiveLimit: user.credit_limit ?? fallback,
			effectivePeriod: (user.credit_period ?? period) as typeof period,
			spend: user.credit_period
				? spendSince(user.id, periodStart(user.credit_period as typeof period))
				: (spend[user.id] ?? { inputTokens: 0, outputTokens: 0, cost: 0 })
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
