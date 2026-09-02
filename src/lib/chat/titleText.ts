/** Its own module, so the browser and the server tidy the answer the same way. The wording that asks for the title lives in `defaultPrompts`, being one the user may change. */

/** Titles render as plain text, so any markdown the model returns despite the instruction would show as raw markup. Strips the common markers, then tidies quotes, trailing punctuation and whitespace. */
export function stripTitleMarkdown(raw: string): string {
	return raw
		.trim()
		.replace(/^title\s*[:\-—]\s*/i, '') // drop a "Title:" prefix some models add
		.replace(/^\s*(?:#{1,6}\s+|>\s+|[-*+]\s+|\d+[.)]\s+)/, '') // leading heading/quote/list marker
		.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1') // links → link text
		.replace(/(\*\*|__)(.*?)\1/g, '$2') // bold
		.replace(/(\*|_)(.*?)\1/g, '$2') // italic
		.replace(/`+([^`]*)`+/g, '$1') // inline code
		.replace(/^["'“”]+|["'“”]+$/g, '') // surrounding quotes
		.replace(/[.\s]+$/, '') // trailing dots / whitespace
		.replace(/\s+/g, ' ') // collapse internal whitespace / newlines
		.trim();
}
