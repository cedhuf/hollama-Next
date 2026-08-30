import type { ChattoConfig } from '$lib/integrations';
import type { Message } from '$lib/sessions';

import {
	type ChattoClient,
	type ChattoMessage,
	type ChattoMessageReference,
	type ChattoTimelineEvent
} from './client';

/**
 * What the model is shown, and nothing more.
 *
 * Chatto pushes a pointer to one message. Everything around it is a request we
 * choose to make, so how much of the room reaches a model is settled here and
 * only here, from the account's own setting. `mention` is the floor and means
 * exactly what it says: one message, one request, nothing else read.
 *
 * Speakers are named inside the text rather than mapped onto roles, because
 * there is no role for "somebody else in the room". A transcript of three
 * people flattened into `user` reads as one person contradicting themselves;
 * with names in front, a model handles it the way a person reading the room
 * would. The bot's own past messages do become `assistant`, which is the one
 * mapping that is true.
 */

/** A ceiling on a thread read, so a long one cannot blow up a request. */
const THREAD_LIMIT = 60;

interface Author {
	name: string;
}

/** Names for a set of ids, in one call, tolerating a server that answers with fewer. */
async function authorsOf(
	client: ChattoClient,
	ids: string[],
	signal: AbortSignal
): Promise<Map<string, Author>> {
	const unique = [...new Set(ids)].filter(Boolean);
	const authors = new Map<string, Author>();
	if (!unique.length) return authors;

	// The API takes a hundred at a time, and a context window will never hold
	// that many distinct speakers, so one call is the whole of it.
	const { users } = await client.batchGetUsers(unique.slice(0, 100), signal);
	for (const user of users ?? []) {
		authors.set(user.id, { name: user.displayName?.trim() || user.login?.trim() || user.id });
	}
	return authors;
}

function messagesOf(events: ChattoTimelineEvent[] | undefined): ChattoMessage[] {
	return (events ?? [])
		.map((event) => event.messagePosted?.message)
		.filter((message): message is ChattoMessage => !!message?.body?.trim());
}

/**
 * The timeline as a transcript.
 *
 * Everything after the message that called the bot is dropped: a window centred
 * on an event carries what came after it too, and answering a question with the
 * replies to it already in hand is answering a different question.
 */
function transcript(
	history: ChattoMessage[],
	upToEventId: string,
	selfId: string,
	authors: Map<string, Author>
): Message[] {
	const cut = history.findIndex((message) => message.id === upToEventId);
	const visible = cut === -1 ? history : history.slice(0, cut + 1);

	return visible.map((message) => {
		const body = message.body!.trim();
		if (message.actorId === selfId) {
			return { role: 'assistant' as const, content: body };
		}
		const name = authors.get(message.actorId)?.name ?? message.actorId;
		return { role: 'user' as const, content: `${name}: ${body}` };
	});
}

export async function buildContext(
	client: ChattoClient,
	config: ChattoConfig,
	reference: ChattoMessageReference,
	selfId: string,
	signal: AbortSignal
): Promise<Message[]> {
	// The message that called the bot, always. It is the request, and in the
	// narrowest mode it is also the entire context.
	const { message: called } = await client.getMessage(reference.roomId, reference.eventId, signal);
	if (!called?.body?.trim()) return [];

	if (config.context === 'mention') {
		const authors = await authorsOf(client, [called.actorId], signal);
		return transcript([called], called.id, selfId, authors);
	}

	// A thread is its own context, whichever of the two wider modes is set: what
	// came before it in the room is a different conversation, and a thread read
	// whole is one request rather than two.
	const root = reference.threadRootEventId || called.threadRootEventId;
	let history: ChattoMessage[];

	if (root) {
		const limit = config.context === 'thread' ? THREAD_LIMIT : config.contextCount;
		const { page } = await client.getThreadEvents(reference.roomId, root, limit, signal);
		history = messagesOf(page?.events);
	} else {
		// Called at room level. `thread` has no thread to read, so it falls back to
		// the same window as `recent`: the alternative would be sending nothing but
		// the mention while claiming to send the most context of the three.
		const limit = config.context === 'thread' ? THREAD_LIMIT : config.contextCount;
		const { page } = await client.getRoomEventsAround(
			reference.roomId,
			reference.eventId,
			// Asked for wider than needed and trimmed below: the window is centred on
			// the anchor, so half of what comes back is the future.
			limit * 2,
			signal
		);
		history = messagesOf(page?.events);
	}

	// The call itself may not be in what came back, on a server that hides it or
	// on a page boundary. Appending it is better than answering without it.
	if (!history.some((message) => message.id === called.id)) history.push(called);

	const authors = await authorsOf(
		client,
		history.map((message) => message.actorId),
		signal
	);
	const full = transcript(history, called.id, selfId, authors);

	// The cut is the last N of the conversation, not the first: the message that
	// called the bot has to be in what is sent, and it is at the end.
	return config.context === 'thread' ? full : full.slice(-config.contextCount);
}
