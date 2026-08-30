/**
 * Talking to a Chatto server as a bot.
 *
 * Chatto's public API is ConnectRPC, and Connect's unary calls are a plain POST
 * of JSON to a path built from the service and method names. So this is a fetch
 * wrapper and a handful of typed methods, not a generated client: the five calls
 * a bot makes are written out below, and adding a sixth is four lines.
 *
 * The alternative was generating a client from the `.proto` files, which buys
 * exhaustive types and costs a build step, a code generator and a vendored copy
 * of an API that is explicitly experimental and explicitly allowed to break in
 * the 0.x line. When it breaks, a small hand-written surface is a small edit.
 *
 * The types below describe only the fields this integration reads. Protobuf
 * JSON is lowerCamelCase, and unknown fields are ignored on both sides, so a
 * server that grows a field costs nothing here.
 */

export interface ChattoUser {
	id: string;
	login?: string;
	displayName?: string;
	isBot?: boolean;
}

export interface ChattoMessage {
	id: string;
	roomId: string;
	createdAt?: string;
	actorId: string;
	body?: string;
	threadRootEventId?: string;
}

export interface ChattoTimelineEvent {
	id: string;
	createdAt?: string;
	actorId: string;
	messagePosted?: { message: ChattoMessage };
}

export interface ChattoTimelinePage {
	events?: ChattoTimelineEvent[];
	hasOlder?: boolean;
	hasNewer?: boolean;
}

/**
 * The pointer a notification carries, as Chatto sends it.
 *
 * The room arrives as a summary object rather than as an id, which is the one
 * place in this API where a reference is not a bare string. Kept in the shape
 * the wire uses, and flattened by `referenceOf` into what the rest of the code
 * works with, so exactly one function knows about the difference.
 */
interface WireMessageReference {
	room?: { id?: string; name?: string };
	eventId?: string;
	threadRootEventId?: string;
}

/** Which message, in which room, in which thread. */
export interface ChattoMessageReference {
	roomId: string;
	eventId: string;
	threadRootEventId?: string;
}

/**
 * The causes this integration acts on.
 *
 * Chatto raises others for the same account, and they are ignored rather than
 * rejected: a bot that answered every reaction and every room message would be
 * a bot nobody keeps.
 */
export const ACTIVATING_CAUSES = [
	'directMessageReceived',
	'directMentionReceived',
	'replyReceived',
	'followedThreadActivity'
] as const;

export type ActivatingCause = (typeof ACTIVATING_CAUSES)[number];

export interface ChattoOccurrence {
	id: string;
	createdAt?: string;
	actor?: ChattoUser;
	signal?: Partial<Record<ActivatingCause, { message?: WireMessageReference }>> &
		Record<string, unknown>;
}

export class ChattoError extends Error {
	constructor(
		message: string,
		readonly status: number,
		readonly code?: string
	) {
		super(message);
		this.name = 'ChattoError';
	}
}

export class ChattoClient {
	readonly #baseUrl: string;
	readonly #token: string;

	constructor(baseUrl: string, token: string) {
		this.#baseUrl = baseUrl.replace(/\/+$/, '');
		this.#token = token;
	}

	async #call<T>(method: string, body: unknown, signal?: AbortSignal): Promise<T> {
		const response = await fetch(`${this.#baseUrl}/api/connect/${method}`, {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				authorization: `Bearer ${this.#token}`
			},
			body: JSON.stringify(body ?? {}),
			signal
		});

		if (!response.ok) {
			// Connect reports failures as a JSON body carrying a code and a message.
			// Both are worth keeping: the code is what a caller branches on, the
			// message is what a person reads in the settings form.
			const detail = (await response.json().catch(() => null)) as {
				code?: string;
				message?: string;
			} | null;
			throw new ChattoError(
				detail?.message || `HTTP ${response.status}`,
				response.status,
				detail?.code
			);
		}

		return (await response.json()) as T;
	}

	/** Who this key is. Used to prove a connection works, and to know our own id. */
	async getViewer(signal?: AbortSignal): Promise<{ user?: { profile?: ChattoUser } }> {
		return this.#call('chatto.api.v1.ViewerService/GetViewer', {}, signal);
	}

	/**
	 * What has happened that concerns this account.
	 *
	 * A latest-value list, newest first, not a queue: the same occurrence comes
	 * back on every call until it ages out, which is why the caller claims each
	 * one before acting on it.
	 */
	async listNotificationOccurrences(
		limit: number,
		signal?: AbortSignal
	): Promise<{ occurrences?: ChattoOccurrence[] }> {
		return this.#call(
			'chatto.api.v1.NotificationService/ListNotificationOccurrences',
			{ page: { limit } },
			signal
		);
	}

	/** Mark one occurrence read, so the bot's own unread count does not grow forever. */
	async markNotificationRead(notificationId: string, signal?: AbortSignal): Promise<unknown> {
		return this.#call(
			'chatto.api.v1.NotificationService/MarkNotificationRead',
			{ notificationId },
			signal
		);
	}

	/** One message, by id. The floor of context: what was actually said to the bot. */
	async getMessage(
		roomId: string,
		eventId: string,
		signal?: AbortSignal
	): Promise<{ message?: ChattoMessage }> {
		return this.#call('chatto.api.v1.MessageService/GetMessage', { roomId, eventId }, signal);
	}

	/** A thread, root included. */
	async getThreadEvents(
		roomId: string,
		threadRootEventId: string,
		limit: number,
		signal?: AbortSignal
	): Promise<{ page?: ChattoTimelinePage }> {
		return this.#call(
			'chatto.api.v1.ThreadService/GetThreadEvents',
			{ roomId, threadRootEventId, limit },
			signal
		);
	}

	/** A window of room timeline centred on one event, which is how context before a mention is read. */
	async getRoomEventsAround(
		roomId: string,
		eventId: string,
		limit: number,
		signal?: AbortSignal
	): Promise<{ page?: ChattoTimelinePage; targetIndex?: number }> {
		return this.#call(
			'chatto.api.v1.RoomService/GetRoomEventsAround',
			{ roomId, eventId, limit },
			signal
		);
	}

	async batchGetUsers(userIds: string[], signal?: AbortSignal): Promise<{ users?: ChattoUser[] }> {
		if (!userIds.length) return { users: [] };
		return this.#call('chatto.api.v1.UserService/BatchGetUsers', { userIds }, signal);
	}

	/**
	 * Post the answer.
	 *
	 * Deliberately this rather than a bot's incoming webhook, which Chatto also
	 * offers: a webhook can post at room level or open a new thread, and cannot
	 * reply inside the thread the question was asked in, which is the case that
	 * matters most. This also means one credential instead of two.
	 */
	async createMessage(
		input: {
			roomId: string;
			body: string;
			threadRootEventId?: string;
			inReplyTo?: string;
			createThread?: boolean;
		},
		signal?: AbortSignal
	): Promise<{ message?: ChattoMessage }> {
		return this.#call('chatto.api.v1.MessageService/CreateMessage', input, signal);
	}
}

/** The cause carried by an occurrence, when it is one this integration acts on. */
export function activatingCause(occurrence: ChattoOccurrence): ActivatingCause | null {
	for (const cause of ACTIVATING_CAUSES) {
		if (occurrence.signal?.[cause]) return cause;
	}
	return null;
}

/** The message an occurrence points at, when it points at one. */
export function referenceOf(occurrence: ChattoOccurrence): ChattoMessageReference | null {
	const cause = activatingCause(occurrence);
	if (!cause) return null;

	const reference = occurrence.signal?.[cause]?.message;
	const roomId = reference?.room?.id;
	if (!roomId || !reference?.eventId) return null;

	return {
		roomId,
		eventId: reference.eventId,
		threadRootEventId: reference.threadRootEventId
	};
}
