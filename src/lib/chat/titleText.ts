/**
 * The wording of a title, and the cleaning up after it.
 *
 * Its own module so the browser and the server produce the same titles: both
 * ask the same thing and tidy the answer the same way, and neither has to import
 * the other's world to do it.
 */

export const TITLE_SYSTEM_PROMPT =
	'Generate a short, descriptive title (3 to 6 words) for a conversation that starts with the ' +
	'following message. Reply with only the title — no quotes, no markdown, no trailing punctuation.';

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
