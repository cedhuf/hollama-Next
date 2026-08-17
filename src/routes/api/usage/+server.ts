import { json } from '@sveltejs/kit';

import { requireUser } from '$lib/server/api';
import {
	creditLimitFor,
	creditPeriod,
	periodStart,
	spendSince,
	type CreditPeriod
} from '$lib/server/db/usage';

/**
 * What this account has spent, and what it is allowed.
 *
 * Its own, and only its own: an administrator reading everybody's goes through
 * the admin route. Shown in Profile because that is where somebody looks for
 * facts about themselves, and because a limit nobody can see is a limit that
 * arrives as a surprise.
 */
export async function GET(event) {
	const user = await requireUser(event);

	const period = creditPeriod();
	const from = periodStart(period);

	return json({
		period,
		from,
		resetsAt: nextPeriodStart(period, from),
		limit: creditLimitFor(user.id),
		spend: spendSince(user.id, from)
	});
}

/** When the counter goes back to zero, as an instant the browser can format. */
function nextPeriodStart(period: CreditPeriod, from: string): string {
	const start = new Date(`${from}T00:00:00.000Z`);
	if (period === 'month') start.setUTCMonth(start.getUTCMonth() + 1);
	else start.setUTCDate(start.getUTCDate() + 7);
	return start.toISOString();
}
