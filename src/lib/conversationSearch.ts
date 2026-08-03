import type { Session } from '$lib/sessions';
import { resolveSessionTitle } from '$lib/sessionShape';

/**
 * Searching your own conversations, by content.
 *
 * The shape of a result and the marking of matches are shared: server mode
 * answers from SQLite's full-text index, local mode scans what is already in
 * memory, and the same modal renders either.
 */

/**
 * How a match is marked inside an excerpt.
 *
 * Private-use code points rather than `<mark>`: an excerpt is message content,
 * so building HTML out of it would give any conversation containing markup a way
 * into the page. `splitExcerpt` turns these back into plain text segments.
 */
export const MATCH_OPEN = '\uE000';
export const MATCH_CLOSE = '\uE001';

/** Characters of context kept on either side of a match, local mode. */
const EXCERPT_RADIUS = 90;

export interface ConversationMatch {
	messageIndex: number;
	role: string;
	excerpt: string;
}

export interface ConversationResult {
	sessionId: string;
	title: string;
	updatedAt?: string;
	matches: ConversationMatch[];
}

/** An excerpt cut into plain segments, each flagged as matching or not. */
export function splitExcerpt(excerpt: string): { text: string; match: boolean }[] {
	const segments: { text: string; match: boolean }[] = [];

	for (const chunk of excerpt.split(MATCH_OPEN)) {
		const [matched, ...rest] = chunk.split(MATCH_CLOSE);
		if (rest.length === 0) {
			if (matched) segments.push({ text: matched, match: false });
			continue;
		}
		if (matched) segments.push({ text: matched, match: true });
		const trailing = rest.join(MATCH_CLOSE);
		if (trailing) segments.push({ text: trailing, match: false });
	}

	return segments;
}

/** Every word has to appear, in any order — the local echo of FTS5's implicit AND. */
function words(query: string): string[] {
	return query.toLowerCase().trim().split(/\s+/).filter(Boolean);
}

/** Cut a window around the first match and mark every occurrence inside it. */
function excerptAround(content: string, terms: string[]): string | null {
	const haystack = content.toLowerCase();
	const first = terms
		.map((term) => haystack.indexOf(term))
		.filter((index) => index !== -1)
		.sort((a, b) => a - b)[0];
	if (first === undefined) return null;

	const start = Math.max(0, first - EXCERPT_RADIUS);
	const end = Math.min(content.length, first + EXCERPT_RADIUS);
	let window = content.slice(start, end);

	// Longest first, so a term contained in another doesn't mark it twice.
	for (const term of [...terms].sort((a, b) => b.length - a.length)) {
		window = markTerm(window, term);
	}

	return (start > 0 ? '…' : '') + window + (end < content.length ? '…' : '');
}

function markTerm(text: string, term: string): string {
	let result = '';
	let cursor = 0;

	for (;;) {
		const index = text.toLowerCase().indexOf(term, cursor);
		if (index === -1) break;
		// Never mark inside an existing mark, or the sentinels would nest.
		const alreadyMarked = text.slice(cursor, index).lastIndexOf(MATCH_OPEN) > -1;
		result += text.slice(cursor, index);
		result += alreadyMarked
			? text.slice(index, index + term.length)
			: MATCH_OPEN + text.slice(index, index + term.length) + MATCH_CLOSE;
		cursor = index + term.length;
	}

	return result + text.slice(cursor);
}

/**
 * Local mode's search: a scan of the conversations already in memory.
 *
 * No index to maintain — there is no server to ask, and everything is loaded
 * anyway. Ordered by how many messages matched, then by recency, which is the
 * closest honest approximation of a relevance ranking without a scorer.
 */
export function searchSessionsLocally(sessions: Session[], query: string): ConversationResult[] {
	const terms = words(query);
	if (!terms.length) return [];

	const results: ConversationResult[] = [];

	for (const session of sessions) {
		const matches: ConversationMatch[] = [];

		session.messages?.forEach((message, messageIndex) => {
			const content = message.content ?? '';
			if (!content) return;
			const haystack = content.toLowerCase();
			if (!terms.every((term) => haystack.includes(term))) return;

			const excerpt = excerptAround(content, terms);
			if (excerpt) matches.push({ messageIndex, role: message.role, excerpt });
		});

		if (matches.length) {
			results.push({
				sessionId: session.id,
				title: resolveSessionTitle(session),
				updatedAt: session.updatedAt,
				matches
			});
		}
	}

	return results.sort(
		(a, b) =>
			b.matches.length - a.matches.length || (b.updatedAt ?? '').localeCompare(a.updatedAt ?? '')
	);
}
