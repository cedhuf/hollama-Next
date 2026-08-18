/**
 * The cleaning up after a title.
 *
 * Its own module so the browser and the server tidy the answer the same way, and
 * neither has to import the other's world to do it. The wording that asks for the
 * title lives in `defaultPrompts` with every other instruction the app injects,
 * because it is one the user is entitled to change.
 */

/**
 * Session titles render as plain text, so any markdown the model returns despite
 * the instruction (e.g. `**Bold**`, `# Heading`, `` `code` ``) would show as raw
 * markup. Strip the common inline/block markers while keeping the text, then tidy
 * surrounding quotes, trailing punctuation and whitespace.
 */
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
