/**
 * The `<read>` protocol.
 *
 * Web search hands the model a title, a URL and a snippet per result (a sentence
 * or two, sometimes marketing copy) and asks it to write a factual answer from
 * that. It fills the gaps, which is a polite word for inventing.
 *
 * So the model is allowed to say it needs more: answering with `<read>1,3</read>`
 * asks for the full text of results 1 and 3, which is fetched and handed back for
 * a second, informed pass. The cost is paid only when it asks: a question the
 * snippets already answer costs nothing extra.
 *
 * A result number only means something within the turn that was given that list,
 * so a page from an earlier turn can also be addressed by its URL:
 * `<read>https://example.com/page</read>`. That is what lets the model check a
 * claim it made three messages ago instead of taking the claim back. Which URLs
 * are allowed is not decided here: the caller resolves them against the sources
 * the conversation was actually shown (see `sourceIndex.ts`), so a fabricated
 * address fetches nothing.
 *
 * A text protocol rather than native tool calling, for the same reason as `<ask>`:
 * it works on every provider the app talks to, including the ones with no function
 * calling at all.
 */

/** What the model asked to read: result numbers, addresses, or a mix of both. */
export interface ReadRequest {
	/** Indices (1-based, as numbered in the search context of the current turn). */
	indices: number[];
	/** Addresses, still to be checked against what the conversation was shown. */
	urls: string[];
}

export function parseReadBlock(raw: string): ReadRequest {
	const match = raw.match(/<read>\s*([\s\S]*?)<\/read>/i);
	if (!match) return { indices: [], urls: [] };

	const indices = new Set<number>();
	const urls = new Set<string>();

	for (const part of match[1].split(/[,\s]+/)) {
		if (!part) continue;

		if (/^https?:\/\//i.test(part)) {
			// Trailing punctuation from a model writing prose around its address.
			urls.add(part.replace(/[.,;)\]]+$/, ''));
			continue;
		}

		const n = Number.parseInt(part, 10);
		// A result number, not an arbitrary integer: anything else is noise.
		if (Number.isInteger(n) && n > 0 && n <= 20) indices.add(n);
	}

	return { indices: [...indices], urls: [...urls] };
}

/**
 * The answer without the request block.
 *
 * Used when the model asks again on the second pass, or asks for something that
 * can't be read: the raw markup must never reach the conversation.
 */
export function stripReadBlock(raw: string): string {
	return raw.replace(/<read>[\s\S]*?<\/read>/gi, '').trim();
}
