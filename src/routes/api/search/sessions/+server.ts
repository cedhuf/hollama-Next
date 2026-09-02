import { json } from '@sveltejs/kit';

import type { ConversationResult } from '$lib/conversationSearch';
import { requireUser } from '$lib/server/api';
import { getSessionHeaders, searchSessions, sessionBoundaries } from '$lib/server/db/search';

/** Conversations to return at most; each still carries all of its matches. */
const MAX_CONVERSATIONS = 30;

/** Its own route rather than a member of `/api/data/[collection]`, which would read `search` as an item id. Results are grouped per conversation in the order FTS5 ranked them. */
export async function GET(event) {
	const user = await requireUser(event);
	const query = event.url.searchParams.get('q')?.trim() ?? '';
	if (!query) return json([] satisfies ConversationResult[]);

	/** Off by default: a summary repeats what is said elsewhere, so it doubles every result, and a conversation you cleared is one you set aside. Until it is what you are looking for. */
	const everything = event.url.searchParams.get('all') === '1';

	const hits = searchSessions(user.id, query);
	const boundaries = everything
		? new Map<string, { clearedAt: number; markers: number[] }>()
		: sessionBoundaries(user.id, [...new Set(hits.map((hit) => hit.sessionId))]);

	const visible = (sessionId: string, index: number) => {
		if (everything) return true;
		const found = boundaries.get(sessionId);
		if (!found) return true;
		return index > found.clearedAt && !found.markers.includes(index);
	};

	const grouped = new Map<string, ConversationResult>();

	for (const hit of hits) {
		if (!visible(hit.sessionId, hit.messageIndex)) continue;
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
