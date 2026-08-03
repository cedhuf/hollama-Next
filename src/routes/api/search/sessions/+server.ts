import { json } from '@sveltejs/kit';

import type { ConversationResult } from '$lib/conversationSearch';
import { requireUser } from '$lib/server/api';
import { getSessionHeaders, searchSessions } from '$lib/server/db/search';

/** Conversations to return at most; each still carries all of its matches. */
const MAX_CONVERSATIONS = 30;

/**
 * Search the signed-in user's conversations by content.
 *
 * Its own route rather than a member of `/api/data/[collection]`, which would
 * read `search` as an item id. Results are grouped per conversation in the order
 * FTS5 ranked them, so the best match decides where its conversation appears
 * while every other hit inside it stays reachable.
 */
export async function GET(event) {
	const user = await requireUser(event);
	const query = event.url.searchParams.get('q')?.trim() ?? '';
	if (!query) return json([] satisfies ConversationResult[]);

	const grouped = new Map<string, ConversationResult>();

	for (const hit of searchSessions(user.id, query)) {
		const existing = grouped.get(hit.sessionId);
		if (existing) {
			existing.matches.push({
				messageIndex: hit.messageIndex,
				role: hit.role,
				excerpt: hit.excerpt
			});
			continue;
		}
		if (grouped.size >= MAX_CONVERSATIONS) continue;
		grouped.set(hit.sessionId, {
			sessionId: hit.sessionId,
			title: '',
			matches: [{ messageIndex: hit.messageIndex, role: hit.role, excerpt: hit.excerpt }]
		});
	}

	const headers = getSessionHeaders(user.id, [...grouped.keys()]);
	const results = [...grouped.values()].map((result) => ({
		...result,
		title: headers.get(result.sessionId)?.title ?? '',
		updatedAt: headers.get(result.sessionId)?.updatedAt,
		// Within a conversation, read them in the order they were said.
		matches: result.matches.sort((a, b) => a.messageIndex - b.messageIndex)
	}));

	return json(results satisfies ConversationResult[]);
}
