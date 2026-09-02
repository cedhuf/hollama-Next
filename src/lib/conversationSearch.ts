/** Shared rather than owned by either side: SQLite's full-text index produces these, and the modal renders them. */

/** Private-use code points rather than `<mark>`: an excerpt is message content, so building HTML out of it would give any conversation containing markup a way into the page. */
export const MATCH_OPEN = '\uE000';
export const MATCH_CLOSE = '\uE001';

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
