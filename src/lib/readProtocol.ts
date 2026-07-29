/**
 * The `<read>` protocol.
 *
 * Web search hands the model a title, a URL and a snippet per result — a sentence
 * or two, sometimes marketing copy — and asks it to write a factual answer from
 * that. It fills the gaps, which is a polite word for inventing.
 *
 * So the model is allowed to say it needs more: answering with `<read>1,3</read>`
 * asks for the full text of results 1 and 3, which is fetched and handed back for
 * a second, informed pass. The cost is paid only when it asks — a question the
 * snippets already answer costs nothing extra.
 *
 * A text protocol rather than native tool calling, for the same reason as `<ask>`:
 * it works on every provider the app talks to, including the ones with no function
 * calling at all.
 */

/** Indices (1-based, as numbered in the search context) the model asked to read. */
export function parseReadBlock(raw: string): number[] {
	const match = raw.match(/<read>\s*([\s\S]*?)<\/read>/i);
	if (!match) return [];

	const seen = new Set<number>();
	for (const part of match[1].split(/[,\s]+/)) {
		const n = Number.parseInt(part, 10);
		// A result number, not an arbitrary integer: anything else is noise.
		if (Number.isInteger(n) && n > 0 && n <= 20) seen.add(n);
	}
	return [...seen];
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
