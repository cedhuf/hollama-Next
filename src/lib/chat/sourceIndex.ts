/**
 * What the conversation has already looked up.
 *
 * Search results are injected for one request and then dropped, so the next turn
 * the model reads its own answer citing `[1]` with no `[1]` in front of it. When
 * its weights disagree it concludes it made the whole thing up and takes back an
 * answer that was correct and sourced.
 *
 * The fix is deliberately not "replay the evidence": snippets are bulky and age,
 * and paying for them on every request guards against a doubt that usually never
 * comes. What survives is the index, about 80 tokens a turn against roughly 600.
 * The evidence stays one `<read>` away, paid for when the model asks.
 */
import type { Message, SearchSource } from '$lib/sessions';

/** A source as the answer that used it numbered it. */
export interface RecalledSource extends SearchSource {
	/** Its `[n]` in the block that turn was given, so old citations still resolve. */
	number: number;
}

/** One earlier lookup, reduced to the sources its answer relied on. */
export interface RecalledSearch {
	/** What was searched. Empty when the turn read pages the user linked instead. */
	query: string;
	sources: RecalledSource[];
}

/** Ceilings, not expiry dates. An entry is two lines, so a conversation has to be long before this binds at all, and then the answer is to shed the oldest. A three-turn window would put us back where we started. */
const MAX_SOURCES_PER_SEARCH = 5;
const MAX_SOURCES_TOTAL = 20;

/** The `[n]` an answer cited, in the order it cited them. */
function citedNumbers(content: string): number[] {
	const seen = new Set<number>();
	for (const match of content.matchAll(/\[(\d{1,2})\]/g)) {
		const n = Number.parseInt(match[1], 10);
		if (n > 0) seen.add(n);
	}
	return [...seen];
}

/**
 * The searches worth carrying forward, oldest first, and only the sources an
 * answer cited: a result the model was shown and did not use contributed
 * nothing. An answer that cited none keeps the whole list, since that is the
 * model ignoring the citation instruction rather than a turn where nothing
 * mattered.
 */
export function recallSearches(messages: Message[]): RecalledSearch[] {
	const searches: RecalledSearch[] = [];

	for (const message of messages) {
		if (message.role !== 'assistant') continue;
		const sources = message.webSearch?.sources;
		if (!sources?.length) continue;

		const cited = citedNumbers(message.content ?? '');
		const wanted = cited.length ? cited : sources.map((_, i) => i + 1);

		const recalled = wanted
			.map((number) => {
				const source = sources[number - 1];
				return source ? { ...source, number } : null;
			})
			.filter((source): source is RecalledSource => !!source)
			.slice(0, MAX_SOURCES_PER_SEARCH);

		if (recalled.length) {
			searches.push({ query: message.webSearch?.query ?? '', sources: recalled });
		}
	}

	// Shed from the front: the most recent lookups are the ones a follow-up is
	// about, and the ones a doubt is most likely to land on.
	let total = searches.reduce((sum, search) => sum + search.sources.length, 0);
	while (total > MAX_SOURCES_TOTAL && searches.length > 1) {
		total -= searches[0].sources.length;
		searches.shift();
	}

	return searches;
}

/** The `{results}` payload: one heading per lookup, sources under it. */
export function formatSourceIndex(searches: RecalledSearch[]): string {
	return searches
		.map((search) => {
			const heading = search.query ? `Searched: ${search.query}` : 'Pages read from the message';
			const lines = search.sources.map((s) => `[${s.number}] ${s.title}\n    ${s.url}`);
			return [heading, ...lines].join('\n');
		})
		.join('\n\n');
}

/** An allowlist, and the reason `<read>` takes a URL at all: the model addresses a page the conversation has been shown, never one it composed. */
export function recallableUrls(searches: RecalledSearch[]): Set<string> {
	return new Set(searches.flatMap((search) => search.sources.map((source) => source.url)));
}
