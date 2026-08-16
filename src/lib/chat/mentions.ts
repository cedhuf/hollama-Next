import type { Persona } from '$lib/personas';

/**
 * Calling a persona into a conversation with `@`.
 *
 * A mention names who the message is addressed to. The default assistant does
 * not answer alongside them: naming someone is choosing them, not adding them.
 *
 * Matching is done against the personas that exist, longest name first, rather
 * than by a pattern over the text. A pattern has to decide what a name looks
 * like, and it always decides wrongly: `@Chef Robert` is one persona, and any
 * rule that stops at the space makes it unreachable. Trying the known names
 * removes the question, and has the pleasant side effect that an `@` followed by
 * anything else is simply text, with no error to report.
 */

export interface Mention {
	persona: Persona;
	/** Where the `@` is, in the original text. */
	start: number;
	/** One past the last character of the name. */
	end: number;
}

/** The `@` has to open a word: an email address is not a mention. */
function opensWord(text: string, at: number): boolean {
	if (at === 0) return true;
	return /[\s([{"'`]/.test(text[at - 1]);
}

/** And the name has to end one: `@Max` in `@Maxime` is not a mention of Max. */
function closesWord(text: string, at: number): boolean {
	if (at >= text.length) return true;
	return !/[\p{L}\p{N}_-]/u.test(text[at]);
}

/**
 * Every mention in a message, in the order they appear.
 *
 * Overlaps are impossible by construction: a match consumes its span, and the
 * next search starts after it. Which is what makes `@Chef Robert` win over a
 * persona called `Chef` without either of them having to know about the other.
 */
export function findMentions(text: string, personas: Persona[]): Mention[] {
	const named = personas
		.filter((persona) => persona.name.trim())
		.sort((a, b) => b.name.trim().length - a.name.trim().length);
	if (!named.length) return [];

	const haystack = text.toLowerCase();
	const found: Mention[] = [];

	let cursor = 0;
	while (cursor < text.length) {
		const at = text.indexOf('@', cursor);
		if (at === -1) break;

		if (!opensWord(text, at)) {
			cursor = at + 1;
			continue;
		}

		const persona = named.find((candidate) => {
			const name = candidate.name.trim().toLowerCase();
			return haystack.startsWith(name, at + 1) && closesWord(text, at + 1 + name.length);
		});

		if (!persona) {
			cursor = at + 1;
			continue;
		}

		const end = at + 1 + persona.name.trim().length;
		found.push({ persona, start: at, end });
		cursor = end;
	}

	return found;
}

/**
 * Who answers this message, in the order they were named.
 *
 * Deduplicated: naming someone twice in one message is emphasis, not a request
 * for two answers. Empty means the conversation's own assistant, which is what
 * every message was before this existed.
 */
export function mentionedPersonas(text: string, personas: Persona[]): Persona[] {
	const seen = new Set<string>();
	const speakers: Persona[] = [];

	for (const mention of findMentions(text, personas)) {
		if (seen.has(mention.persona.id)) continue;
		seen.add(mention.persona.id);
		speakers.push(mention.persona);
	}

	return speakers;
}

/**
 * The text cut into plain runs and mentions, for drawing them as labels.
 *
 * Segments rather than markup, for the reason the search excerpts give: message
 * content that came back as HTML would hand any conversation containing markup a
 * way into the page.
 */
export type MentionSegment =
	| { kind: 'text'; text: string }
	| { kind: 'mention'; persona: Persona; text: string };

export function splitMentions(text: string, personas: Persona[]): MentionSegment[] {
	const mentions = findMentions(text, personas);
	if (!mentions.length) return [{ kind: 'text', text }];

	const segments: MentionSegment[] = [];
	let cursor = 0;

	for (const mention of mentions) {
		if (mention.start > cursor) {
			segments.push({ kind: 'text', text: text.slice(cursor, mention.start) });
		}
		segments.push({
			kind: 'mention',
			persona: mention.persona,
			text: text.slice(mention.start, mention.end)
		});
		cursor = mention.end;
	}

	if (cursor < text.length) segments.push({ kind: 'text', text: text.slice(cursor) });
	return segments;
}

/**
 * What is being typed after an `@`, for the autocomplete, or `null`.
 *
 * The mirror of `commandPrefix` for slash commands, and it stops at the same
 * place: the caret has to be inside the word the `@` opened, so a mention
 * already written and moved past does not reopen the menu.
 *
 * A space does not close it, unlike a command: persona names have spaces in
 * them, and refusing to look past the first one would make half of them
 * unfindable. What closes it is a newline, or a run long enough that it is
 * plainly prose rather than a name being typed.
 */
const MAX_MENTION_QUERY = 40;

export function mentionPrefix(text: string, caret: number): string | null {
	const before = text.slice(0, caret);
	const at = before.lastIndexOf('@');
	if (at === -1) return null;
	if (!opensWord(before, at)) return null;

	const query = before.slice(at + 1);
	if (query.includes('\n') || query.length > MAX_MENTION_QUERY) return null;
	return query;
}
