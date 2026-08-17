import { getConfig } from './config';
import { getDb } from './index';

/**
 * What each account has spent, and what it is allowed to.
 *
 * A guardrail, not an accounting system. It exists so an instance run for a
 * handful of people catches the runaway loop and the forgotten tab, not so
 * anybody can be invoiced: the figures are as good as what the providers report
 * and what somebody typed into the price fields, and a model nobody priced is
 * not counted at all.
 *
 * Which is why nothing here ever interrupts anything. A turn already under way
 * always finishes; the limit is asked about before the next one starts.
 */

export type CreditPeriod = 'month' | 'week' | 'day';

const LIMIT = 'creditLimit';
const PERIOD = 'creditPeriod';

/** The instance-wide allowance. `0` means no limit, and is the default. */
export function instanceCreditLimit(): number {
	const raw = getConfig(LIMIT);
	const value = raw ? Number(raw) : 0;
	return Number.isFinite(value) && value > 0 ? value : 0;
}

export function setInstanceCreditLimit(value: number): void {
	getDb()
		.prepare(
			`INSERT INTO app_config (key, value) VALUES (?, ?)
			 ON CONFLICT(key) DO UPDATE SET value = excluded.value`
		)
		.run(LIMIT, String(Number.isFinite(value) && value > 0 ? value : 0));
}

const PERIODS: CreditPeriod[] = ['month', 'week', 'day'];

export function creditPeriod(): CreditPeriod {
	const stored = getConfig(PERIOD) as CreditPeriod | null;
	return stored && PERIODS.includes(stored) ? stored : 'month';
}

export function setCreditPeriod(period: CreditPeriod): void {
	getDb()
		.prepare(
			`INSERT INTO app_config (key, value) VALUES (?, ?)
			 ON CONFLICT(key) DO UPDATE SET value = excluded.value`
		)
		.run(PERIOD, PERIODS.includes(period) ? period : 'month');
}

/**
 * The first day of the period a moment falls in, as `YYYY-MM-DD`.
 *
 * Calendar months, ISO weeks (Monday) and plain days, in UTC. UTC because the rows are
 * written in UTC and a boundary that moves with the reader is a boundary two
 * people disagree about; for a monthly guardrail the hours of drift are noise.
 */
export function periodStart(period: CreditPeriod, at = new Date()): string {
	const date = new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()));
	// A day is the row the usage is written into, so its start is that same day.
	if (period === 'day') return date.toISOString().slice(0, 10);
	if (period === 'month') date.setUTCDate(1);
	else {
		// getUTCDay(): Sunday is 0, and the week starts on Monday.
		const weekday = (date.getUTCDay() + 6) % 7;
		date.setUTCDate(date.getUTCDate() - weekday);
	}
	return date.toISOString().slice(0, 10);
}

export const today = (at = new Date()): string => at.toISOString().slice(0, 10);

export interface Spend {
	inputTokens: number;
	outputTokens: number;
	cost: number;
}

/** What one account has spent since the start of the current period. */
export function spendSince(userId: string, from: string): Spend {
	const row = getDb()
		.prepare(
			`SELECT COALESCE(SUM(input_tokens), 0) AS input_tokens,
			        COALESCE(SUM(output_tokens), 0) AS output_tokens,
			        COALESCE(SUM(cost), 0) AS cost
			 FROM user_usage WHERE user_id = ? AND day >= ?`
		)
		.get(userId, from) as { input_tokens: number; output_tokens: number; cost: number };

	return { inputTokens: row.input_tokens, outputTokens: row.output_tokens, cost: row.cost };
}

/** Every account's spend since a day, for the administrator's list. */
export function spendForAll(from: string): Record<string, Spend> {
	const rows = getDb()
		.prepare(
			`SELECT user_id,
			        SUM(input_tokens) AS input_tokens,
			        SUM(output_tokens) AS output_tokens,
			        SUM(cost) AS cost
			 FROM user_usage WHERE day >= ? GROUP BY user_id`
		)
		.all(from) as {
		user_id: string;
		input_tokens: number;
		output_tokens: number;
		cost: number;
	}[];

	return Object.fromEntries(
		rows.map((row) => [
			row.user_id,
			{ inputTokens: row.input_tokens, outputTokens: row.output_tokens, cost: row.cost }
		])
	);
}

/**
 * What was spent each day since a date, oldest first, days with nothing included.
 *
 * The gaps matter: a chart drawn only from the days that have rows says nothing
 * about the days somebody did not use it, which is half of what "is this person
 * running away with it" is asking.
 */
export function dailySpend(userId: string, from: string): { day: string; cost: number }[] {
	const rows = getDb()
		.prepare(
			`SELECT day, SUM(cost) AS cost FROM user_usage
			 WHERE user_id = ? AND day >= ? GROUP BY day ORDER BY day`
		)
		.all(userId, from) as { day: string; cost: number }[];

	const byDay = new Map(rows.map((row) => [row.day, row.cost]));
	const out: { day: string; cost: number }[] = [];

	const cursor = new Date(`${from}T00:00:00.000Z`);
	const end = new Date(`${today()}T00:00:00.000Z`);
	while (cursor <= end) {
		const day = cursor.toISOString().slice(0, 10);
		out.push({ day, cost: byDay.get(day) ?? 0 });
		cursor.setUTCDate(cursor.getUTCDate() + 1);
	}
	return out;
}

/** Add one turn's consumption to today's row. */
export function addUsage(userId: string, usage: Spend): void {
	if (!usage.inputTokens && !usage.outputTokens && !usage.cost) return;

	getDb()
		.prepare(
			`INSERT INTO user_usage (user_id, day, input_tokens, output_tokens, cost)
			 VALUES (?, ?, ?, ?, ?)
			 ON CONFLICT(user_id, day) DO UPDATE SET
			   input_tokens = input_tokens + excluded.input_tokens,
			   output_tokens = output_tokens + excluded.output_tokens,
			   cost = cost + excluded.cost`
		)
		.run(userId, today(), usage.inputTokens, usage.outputTokens, usage.cost);
}

/** The period one account is measured over: its own when set, the instance's otherwise. */
export function creditPeriodFor(userId: string): CreditPeriod {
	const row = getDb().prepare('SELECT credit_period FROM users WHERE id = ?').get(userId) as
		| { credit_period: string | null }
		| undefined;
	const own = row?.credit_period as CreditPeriod | null;
	return own && PERIODS.includes(own) ? own : creditPeriod();
}

export function setCreditPeriodFor(userId: string, period: CreditPeriod | null): void {
	getDb()
		.prepare('UPDATE users SET credit_period = ? WHERE id = ?')
		.run(period && PERIODS.includes(period) ? period : null, userId);
}

/** The allowance for one account: its own when set, the instance's otherwise. */
export function creditLimitFor(userId: string): number {
	const row = getDb().prepare('SELECT credit_limit FROM users WHERE id = ?').get(userId) as
		| { credit_limit: number | null }
		| undefined;
	if (row?.credit_limit != null) return row.credit_limit > 0 ? row.credit_limit : 0;
	return instanceCreditLimit();
}

export function setCreditLimit(userId: string, limit: number | null): void {
	getDb()
		.prepare('UPDATE users SET credit_limit = ? WHERE id = ?')
		.run(limit == null ? null : Math.max(0, limit), userId);
}

/**
 * Whether this account has already spent its allowance.
 *
 * Asked before a turn starts and never during one. `false` whenever there is no
 * limit, which is the default, so an instance nobody has configured behaves
 * exactly as it did before any of this existed.
 */
export function isOverLimit(userId: string): boolean {
	const limit = creditLimitFor(userId);
	if (!limit) return false;
	return spendSince(userId, periodStart(creditPeriodFor(userId))).cost >= limit;
}
