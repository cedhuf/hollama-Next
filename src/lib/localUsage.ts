import { browser } from '$app/environment';
import { modelPrice, type Server } from '$lib/connections';
import { costOf, type TokenCount } from '$lib/usageCounts';

/**
 * What has been spent, on an instance that is one browser.
 *
 * The server keeps this in SQLite, per account, and enforces a limit with it.
 * Here there is no account to limit and nobody to limit it: what is left is the
 * part that is useful to somebody paying their own provider — knowing what the
 * week cost. So this counts and shows, and refuses nothing.
 *
 * Same shape as the server's table, deliberately: a row per day, summed over
 * whatever period is being asked about, so the two halves of the app answer the
 * question the same way and the card that draws it is the same card.
 */

const KEY = 'llooma-usage';

export interface DayUsage {
	day: string;
	inputTokens: number;
	outputTokens: number;
	cost: number;
}

const today = () => new Date().toISOString().slice(0, 10);

function read(): DayUsage[] {
	if (!browser) return [];
	try {
		const raw = localStorage.getItem(KEY);
		const parsed = raw ? (JSON.parse(raw) as unknown) : [];
		return Array.isArray(parsed) ? (parsed as DayUsage[]) : [];
	} catch {
		return [];
	}
}

/**
 * Add one turn, priced by the connection it ran on.
 *
 * Nothing is recorded for a model with no price. Unpriced is not free, here for
 * the same reason it is not free on the server: a figure that counts some models
 * and silently drops others is a figure nobody can read.
 */
export function recordLocalUsage(server: Server | undefined, model: string, counts: TokenCount) {
	if (!browser || (!counts.input && !counts.output)) return;

	const cost = costOf(counts, modelPrice(server, model));
	if (cost === undefined) return;

	const days = read();
	const day = today();
	const existing = days.find((entry) => entry.day === day);

	if (existing) {
		existing.inputTokens += counts.input;
		existing.outputTokens += counts.output;
		existing.cost += cost;
	} else {
		days.push({ day, inputTokens: counts.input, outputTokens: counts.output, cost });
	}

	// Thirteen months, so a year-on-year glance is possible and the key cannot
	// grow without end.
	const cutoff = new Date();
	cutoff.setUTCMonth(cutoff.getUTCMonth() - 13);
	const kept = days.filter((entry) => entry.day >= cutoff.toISOString().slice(0, 10));

	try {
		localStorage.setItem(KEY, JSON.stringify(kept.sort((a, b) => a.day.localeCompare(b.day))));
	} catch {
		// A full quota is not a reason to lose an answer.
	}
}

/** Every day from a date to today, gaps included, oldest first. */
export function localDaily(from: string): { day: string; cost: number }[] {
	const byDay = new Map(read().map((entry) => [entry.day, entry.cost]));
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

/** What has been spent since a date. */
export function localSpend(from: string): {
	inputTokens: number;
	outputTokens: number;
	cost: number;
} {
	return read()
		.filter((entry) => entry.day >= from)
		.reduce(
			(total, entry) => ({
				inputTokens: total.inputTokens + entry.inputTokens,
				outputTokens: total.outputTokens + entry.outputTokens,
				cost: total.cost + entry.cost
			}),
			{ inputTokens: 0, outputTokens: 0, cost: 0 }
		);
}

/** The first day of the current calendar month, which is the period shown here. */
export function localPeriodStart(at = new Date()): string {
	return new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), 1)).toISOString().slice(0, 10);
}

/** The currencies the local prices are written in. */
export function localCurrencies(servers: Server[]): string[] {
	const codes = new Set<string>();
	for (const server of servers) {
		for (const price of Object.values(server.modelPricing ?? {})) {
			if (price.input != null || price.output != null) codes.add(price.currency ?? 'USD');
		}
	}
	return [...codes].sort();
}

/** A day, `n` days back, as the ledger writes them. */
export function daysAgo(n: number): string {
	const date = new Date();
	date.setUTCDate(date.getUTCDate() - n);
	return date.toISOString().slice(0, 10);
}

/** When the month being counted gives way to the next one. */
export function nextMonthStart(from: string): string {
	const date = new Date(`${from}T00:00:00.000Z`);
	date.setUTCMonth(date.getUTCMonth() + 1);
	return date.toISOString();
}
