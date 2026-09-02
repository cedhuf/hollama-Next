/**
 * The `<read>` protocol.
 *
 * Web search hands the model a sentence or two per result and asks for a factual
 * answer, so it fills the gaps. Instead it may say it needs more:
 * `<read>1,3</read>` asks for the full text, fetched and handed back for a
 * second pass, and the cost is paid only when it asks.
 *
 * A result number only means something within its own turn, so a page from an
 * earlier one is addressed by URL. The caller resolves those against what the
 * conversation was shown, so a fabricated address fetches nothing.
 *
 * A text protocol, like `<ask>`: it works on every provider.
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

/** Used when the model asks again on the second pass, or asks for something that cannot be read: the raw markup must never reach the conversation. */
export function stripReadBlock(raw: string): string {
	return raw.replace(/<read>[\s\S]*?<\/read>/gi, '').trim();
}
