import { json } from '@sveltejs/kit';

import { requireUser } from '$lib/server/api';
import { spendCurrencies } from '$lib/server/db/servers';
import {
	creditLimitFor,
	creditPeriodFor,
	dailySpend,
	periodStart,
	spendSince,
	type CreditPeriod
} from '$lib/server/db/usage';

/** Its own, and only its own: an administrator reading everybody's goes through the admin route. In Profile, because a limit nobody can see is one that arrives as a surprise. */
export async function GET(event) {
	const user = await requireUser(event);

	const period = creditPeriodFor(user.id);
	const from = periodStart(period);

	return json({
		period,
		from,
		resetsAt: nextPeriodStart(period, from),
		limit: creditLimitFor(user.id),
		spend: spendSince(user.id, from),
		// One currency can label a figure; several have to be admitted to, since nothing
		// is converted anywhere.
		currencies: spendCurrencies(),
		// Always the last thirty days, whatever the period: a month of history beside a
		// weekly allowance is what says whether this week is unusual.
		history: dailySpend(user.id, daysAgo(29))
	});
}

/** When the counter goes back to zero, as an instant the browser can format. */
function nextPeriodStart(period: CreditPeriod, from: string): string {
	const start = new Date(`${from}T00:00:00.000Z`);
	if (period === 'month') start.setUTCMonth(start.getUTCMonth() + 1);
	else start.setUTCDate(start.getUTCDate() + (period === 'week' ? 7 : 1));
	return start.toISOString();
}

/** A day, `n` days back, as the ledger writes them. */
function daysAgo(n: number): string {
	const date = new Date();
	date.setUTCDate(date.getUTCDate() - n);
	return date.toISOString().slice(0, 10);
}
