import type { ChattoConfig } from '$lib/integrations';
import type { Message } from '$lib/sessions';

import {
	type ChattoAttachment,
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

/**
 * How many images to carry, and how large one may be.
 *
 * Images are read from the end of the context backwards, because the useful
 * case is somebody posting a picture and asking about it in the next breath.
 * The caps are here because a room is not a form: nothing stops ten photographs
 * in a row, and each one is base64 in a request body.
 */
const MAX_IMAGES = 4;
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

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
		.filter(
			(message): message is ChattoMessage =>
				!!message?.body?.trim() || !!imageAttachments(message).length
		);
}

/** The attachments a vision model could do something with, and only those. */
function imageAttachments(message: ChattoMessage | undefined): ChattoAttachment[] {
	return (message?.attachments ?? []).filter(
		(attachment) => attachment.contentType?.startsWith('image/') && attachment.assetUrl?.url
	);
}

/**
 * Bring the pictures down and hang them on the messages they came with.
 *
 * Newest first and capped, then written back in place: the model reads them as
 * part of the message that carried them, which is the only reading that makes
 * "what is this?" answerable.
 *
 * A download that fails is skipped rather than raised. An image nobody can
 * fetch is worth less than the answer, and the room asked a question either way.
 */
async function attachImages(
	client: ChattoClient,
	sources: ChattoMessage[],
	built: Message[],
	signal: AbortSignal
): Promise<void> {
	let budget = MAX_IMAGES;

	for (let index = sources.length - 1; index >= 0 && budget > 0; index--) {
		const attachments = imageAttachments(sources[index]).slice(0, budget);
		if (!attachments.length) continue;

		const images: { data: string; filename: string }[] = [];
		for (const attachment of attachments) {
			try {
				const asset = await client.fetchAsset(attachment.assetUrl!.url!, signal);
				if (!asset || asset.bytes.byteLength > MAX_IMAGE_BYTES) continue;
				images.push({
					data: Buffer.from(asset.bytes).toString('base64'),
					filename: attachment.filename || attachment.id
				});
			} catch {
				// A signed URL that has expired, or a store that is briefly away.
			}
		}

		if (!images.length) continue;
		built[index] = { ...built[index], images };
		budget -= images.length;
	}
}

/**
 * The timeline as a transcript.
 *
 * Everything after the message that called the bot is dropped: a window centred
 * on an event carries what came after it too, and answering a question with the
 * replies to it already in hand is answering a different question.
 */
function visibleUpTo(history: ChattoMessage[], upToEventId: string): ChattoMessage[] {
	const cut = history.findIndex((message) => message.id === upToEventId);
	return cut === -1 ? history : history.slice(0, cut + 1);
}

function transcript(
	visible: ChattoMessage[],
	selfId: string,
	authors: Map<string, Author>
): Message[] {
	return visible.map((message) => {
		const body = message.body?.trim() ?? '';
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
		const built = transcript([called], selfId, authors);
		await attachImages(client, [called], built, signal);
		return built;
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
	const visible = visibleUpTo(history, called.id);
	const full = transcript(visible, selfId, authors);

	// The cut is the last N of the conversation, not the first: the message that
	// called the bot has to be in what is sent, and it is at the end.
	const keep = config.context === 'thread' ? full.length : config.contextCount;
	const sent = full.slice(-keep);

	// After the cut, so nothing is downloaded for a message that will not be
	// sent, and so the budget is spent on what the model actually sees.
	await attachImages(client, visible.slice(-keep), sent, signal);
	return sent;
}
