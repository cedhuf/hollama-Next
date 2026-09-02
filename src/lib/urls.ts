/** Its own module because both sides of the app need it: the page reads links out of what the user typed, and a turn in the Node process reads them out of the same message with no browser near it. */
export function extractUrls(text: string): string[] {
	const found = text.match(/\bhttps?:\/\/[^\s<>"'`]+/gi) ?? [];
	const cleaned = found.map((url) =>
		// Trailing punctuation usually belongs to the sentence, not the URL, unless it
		// closes a pair that opened inside it.
		url.replace(/[.,;:!?]+$/, '').replace(/\)+$/, (parens) => {
			const opened = (url.match(/\(/g) ?? []).length;
			const closed = (url.match(/\)/g) ?? []).length;
			return closed > opened ? parens.slice(0, opened - closed) : parens;
		})
	);
	return [...new Set(cleaned)];
}
