/**
 * What the conversation has already looked up.
 *
 * Search results are injected as a system block for one request and then dropped.
 * The turn after, the model reads its own answer citing `[1]` and `[3]` with no
 * `[1]` or `[3]` anywhere in front of it, and its own weights are the only thing
 * left to check the claim against. When the weights disagree — a niche game, a
 * product released after training, anything unfamiliar — it concludes it made the
 * whole thing up, apologises, and takes back an answer that was correct and
 * sourced. Watching that happen is what this module is for.
 *
 * The fix is deliberately not "replay the evidence". Snippets are bulky, they age,
 * and paying for them on every subsequent request to guard against a doubt that
 * usually never comes is the wrong trade. What survives here is the index: which
 * searches ran, and which sources the answers actually leaned on. Measured on a
 * real five-result search, that is about 80 tokens a turn against roughly 600 to
 * replay the snippets. The evidence itself stays one `<read>` away, paid for only
 * when the model asks — the same bargain `readProtocol.ts` already makes.
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

/**
 * Ceilings, not expiry dates.
 *
 * An index entry is two lines and costs a few dozen tokens, so a conversation has
 * to be long before this is worth bounding at all — and when it is, the answer is
 * to shed the oldest, not to blank the lot on a timer. A three-turn window would
 * put us back where we started, one turn later.
 */
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
 * The searches worth carrying forward, oldest first.
 *
 * Only the sources an answer cited: a result the model was shown and did not use
 * contributed nothing, and paying to remember it forever is paying for noise. An
 * answer that cited none of them is the exception — the model ignoring the
 * citation instruction, not a turn where nothing mattered — so those keep the
 * whole list rather than vanishing.
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

/**
 * Every address the model may ask to reread.
 *
 * An allowlist, and the reason `<read>` takes a URL at all: the model addresses a
 * page the conversation has already been shown, never one it composed. Nothing it
 * writes can turn into a request to an arbitrary host.
 */
export function recallableUrls(searches: RecalledSearch[]): Set<string> {
	return new Set(searches.flatMap((search) => search.sources.map((source) => source.url)));
}
