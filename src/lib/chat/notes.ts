import type { Message } from '$lib/sessions';

/**
 * The messages that are not turns in the conversation.
 *
 * A conversation carries two sorts of thing. Most of it is what was said. The
 * rest is what happened *to* it: it was compacted, it was set aside, it was
 * inspected. Those are notes, and they had been growing one hardcoded field
 * each — `compaction`, then `cleared` — with the question "does the model read
 * this?" answered separately in four places, in three languages: two backwards
 * loops here, a `reduce` in the client search, and `json_extract` in SQL.
 *
 * Adding a third kind meant editing all four and finding a fifth later. So the
 * kind is data now, not a field name, and everything else asks this module.
 *
 * Two properties, which used to be one:
 *
 * **Boundary.** Compaction and clearing move where the sent conversation starts;
 * a report of what the context contains moves nothing. `NOTE_KINDS` says which,
 * and how, and it is the only place that knows.
 *
 * **Content.** A note's `content` is what the model reads *in its place*, which
 * for a compaction is the summary and for everything else is nothing at all. An
 * empty note is therefore invisible to search without anyone arranging it: the
 * FTS index only takes rows with content, and the client search returns early on
 * an empty one. That is a property of the design, not a filter to remember.
 */

export type NoteKind = 'compaction' | 'cleared' | 'context' | 'mention' | 'playbooks';

/**
 * Where the model starts reading, for a conversation ending at this note.
 *
 * `from` includes the note, because its content stands in for what came before.
 * `after` excludes it, because nothing stands in for anything. `none` is a note
 * that leaves the boundary exactly where it was.
 */
export type NoteBoundary = 'from' | 'after' | 'none';

interface NoteBase {
	/** ISO timestamp of when the line was drawn. */
	generatedAt: string;
}

/** A summary of the messages before it, which is what the model receives instead. */
export interface CompactionNote extends NoteBase {
	kind: 'compaction';
	/** How many messages it stands in for. */
	replacedCount: number;
	/** The model that wrote it, for the divider's tooltip. */
	model?: string;
	/** True when the app compacted on its own, at the configured threshold. */
	automatic?: boolean;
	/** What was typed after `/compact`, when anything was. */
	instruction?: string;
}

/** A line drawn under everything before it, with nothing put in its place. */
export interface ClearedNote extends NoteBase {
	kind: 'cleared';
	/** How many messages are behind it. */
	replacedCount: number;
}

/**
 * What the context held when someone asked, and nothing else.
 *
 * The first note that is purely for the reader: it moves no boundary and the
 * model never sees it. Which is why it is a snapshot rather than a live reading
 * of the conversation it sits in. A panel that recomputed itself would show
 * today's figures under yesterday's question, and the reason to ask is almost
 * always to compare a before with an after.
 *
 * The figures come from `contextSnapshot`, which takes them from `contextUsage`
 * so the report and the ring in the composer cannot disagree.
 */
export interface ContextNote extends NoteBase {
	kind: 'context';
	/** Estimated tokens in what would have been sent at that moment. */
	tokens: number;
	limit: number;
	limitSource: 'model' | 'threshold';
	/** The four things the estimate is made of. They add up to `tokens`. */
	systemTokens: number;
	messageTokens: number;
	sourceTokens: number;
	/**
	 * What the persona's memory costs on every message: the profile and the index.
	 *
	 * Reported because a budget nobody can see is not a budget. Zero when there is
	 * no persona, when the instance has memory off, or when nothing is remembered.
	 */
	memoryTokens: number;
	/** Messages in context, and in the conversation as a whole. */
	messageCount: number;
	totalCount: number;
	/** The single heaviest message, because "why is it full" usually has one answer. */
	heaviest?: { role: string; tokens: number; preview: string };
	model?: string;
}

/**
 * A persona was called into somebody else's conversation, and answered there.
 *
 * Written into the persona's own conversation, which is the one place a
 * relationship with it is kept, and where its absence was strange: you could ask
 * Maïté something in a conversation about a holiday and she would have no idea,
 * next time you opened her, that it had happened.
 *
 * It carries the question and the answer, and nothing else. Not the conversation
 * it happened in, not the turns around it. Two reasons, and the second is the
 * important one: every mention would otherwise copy a whole conversation into
 * another one, and this exchange can be *added* to the persona's context, where
 * anything more would spend somebody's context window on a thread they were not
 * part of.
 *
 * The model reads none of it until it is added. Until then it is a record, for
 * the reader, like every other note.
 */
export interface MentionNote extends NoteBase {
	kind: 'mention';
	/** The conversation it was called into, so the record can link back to it. */
	sessionId: string;
	/** Its title when this was written. Titles change; a record does not. */
	title?: string;
	asked: string;
	answered: string;
	/**
	 * When the exchange was folded into this conversation, if it was.
	 *
	 * A record and an offer at once: the button is gone afterwards, and what
	 * replaces it is a sentence saying the model now knows about it. Adding the
	 * same exchange twice is the failure this prevents.
	 */
	addedAt?: string;
}

/**
 * The playbook list, opened in the conversation it applies to.
 *
 * The one note with no payload, and the one that is not a snapshot. The others
 * record what was true at a moment; this is a control panel, and a control panel
 * showing yesterday's switches would be a picture of a control panel. It carries
 * only the fact that somebody asked for it here, and draws the current state of
 * the library and of this conversation.
 *
 * Which is exactly why it is a note rather than a modal: switching a procedure on
 * is part of how this conversation went, so it belongs in it, at the point it
 * happened, above the answers it changed.
 */
export interface PlaybooksNote extends NoteBase {
	kind: 'playbooks';
}

export type ConversationNote =
	| CompactionNote
	| ClearedNote
	| ContextNote
	| MentionNote
	| PlaybooksNote;

export const NOTE_KINDS: Record<NoteKind, { boundary: NoteBoundary }> = {
	compaction: { boundary: 'from' },
	cleared: { boundary: 'after' },
	context: { boundary: 'none' },
	mention: { boundary: 'none' },
	playbooks: { boundary: 'none' }
};

/** Every kind there is, for the callers that have to enumerate them (the SQL does). */
export const ALL_NOTE_KINDS = Object.keys(NOTE_KINDS) as NoteKind[];

/** The kinds that move where the model starts reading. */
export const BOUNDARY_NOTE_KINDS = ALL_NOTE_KINDS.filter(
	(kind) => NOTE_KINDS[kind].boundary !== 'none'
);

/**
 * What a kind does to the boundary, including the kinds this build has never
 * heard of.
 *
 * A conversation can arrive carrying a note written by a newer version, or by a
 * plugin that is not installed here. Reading the table directly threw on those,
 * from inside the function that decides what to send, which is the worst place
 * to discover an unknown value. Unknown means `none`: it moves nothing, and it
 * is still a note, so it is not fed to the model. Both halves of that are the
 * safe answer rather than a convenient one.
 */
export function boundaryOf(kind: NoteKind): NoteBoundary {
	return NOTE_KINDS[kind]?.boundary ?? 'none';
}

export function noteOf(message: Message): ConversationNote | undefined {
	return message.note;
}

export function isNote(message: Message): boolean {
	return message.note !== undefined;
}

/**
 * The last note that moves the boundary, and where it sits.
 *
 * Whichever came last wins, because a clear after a compaction throws the
 * summary away too, and a compaction after a clear starts from what is left.
 * Asking "which is later" is the only comparison that gives the right answer in
 * both orders, and it keeps giving it as kinds are added.
 */
export function conversationBoundary(messages: Message[]): {
	index: number;
	note?: ConversationNote;
} {
	for (let i = messages.length - 1; i >= 0; i--) {
		const note = messages[i].note;
		if (note && boundaryOf(note.kind) !== 'none') return { index: i, note };
	}
	return { index: -1 };
}

/**
 * The messages actually sent to the model.
 *
 * From the boundary or just after it, depending on what the note put there, and
 * without the notes that are only for the reader. That filter is the part a
 * slice alone cannot do: a boundary can only be the last of its kind, but a
 * report of the context sits wherever it was asked for, which is in the middle
 * of the live conversation.
 */
export function messagesInContext(messages: Message[]): Message[] {
	const { index, note } = conversationBoundary(messages);
	if (!note) return messages.filter((message) => !message.note);

	const boundary = messages[index];
	const from = boundaryOf(note.kind) === 'from' ? index : index + 1;
	return messages.slice(from).filter((message) => message === boundary || !message.note);
}
