import type { Message } from '$lib/sessions';

/**
 * The messages that are not turns in the conversation.
 *
 * A conversation carries two sorts of thing: what was said, and what happened
 * *to* it. The second are notes, and they had been growing one hardcoded field
 * each, with "does the model read this?" answered in four places and three
 * languages. So the kind is data now, and everything else asks this module.
 *
 * **Boundary.** Compaction and clearing move where the sent conversation
 * starts; a report of what the context holds moves nothing. `NOTE_KINDS` is the
 * only place that knows which.
 *
 * **Content.** A note's `content` is what the model reads *in its place*: the
 * summary for a compaction, nothing for the rest. An empty note is therefore
 * invisible to search without anyone arranging it, since the FTS index only
 * takes rows with content.
 */

export type NoteKind = 'compaction' | 'cleared' | 'context' | 'mention' | 'playbooks';

/**
 * `from` includes the note, because its content stands in for what came before.
 * `after` excludes it. `none` leaves the boundary where it was.
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
 * What the context held when someone asked. The first note purely for the
 * reader: it moves no boundary and the model never sees it.
 *
 * A snapshot rather than a live reading, because a panel that recomputed itself
 * would show today's figures under yesterday's question, and the reason to ask
 * is almost always to compare a before with an after.
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
	/** Reported because a budget nobody can see is not a budget. Zero when there is no persona, memory is off, or nothing is remembered. */
	memoryTokens: number;
	/** Messages in context, and in the conversation as a whole. */
	messageCount: number;
	totalCount: number;
	/** The single heaviest message, because "why is it full" usually has one answer. */
	heaviest?: { role: string; tokens: number; preview: string };
	model?: string;
}

/**
 * A persona was called into somebody else's conversation and answered there.
 *
 * Written into the persona's own conversation, which is where a relationship
 * with it is kept: otherwise it would have no idea, next time you opened it,
 * that the exchange had happened.
 *
 * The question and the answer, and nothing else. Every mention would otherwise
 * copy a whole conversation into another one, and this exchange can be *added*
 * to the persona's context, where more would spend somebody's context window on
 * a thread they were not part of.
 *
 * The model reads none of it until it is added.
 */
export interface MentionNote extends NoteBase {
	kind: 'mention';
	/** The conversation it was called into, so the record can link back to it. */
	sessionId: string;
	/** Its title when this was written. Titles change; a record does not. */
	title?: string;
	asked: string;
	answered: string;
	/** A record and an offer at once: the button is gone afterwards, replaced by a sentence saying the model now knows. Adding the same exchange twice is what this prevents. */
	addedAt?: string;
}

/**
 * The playbook list, opened in the conversation it applies to.
 *
 * The one note with no payload and the one that is not a snapshot: a control
 * panel showing yesterday's switches would be a picture of a control panel. It
 * records only that somebody asked for it here.
 *
 * A note rather than a modal because switching a procedure on is part of how
 * this conversation went, above the answers it changed.
 */
export interface PlaybooksNote extends NoteBase {
	kind: 'playbooks';
}

export type ConversationNote =
	CompactionNote | ClearedNote | ContextNote | MentionNote | PlaybooksNote;

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
 * What a kind does to the boundary, including kinds this build has never heard
 * of: a conversation can arrive carrying a note from a newer version. Unknown
 * means `none`, and it is still a note, so it is not fed to the model.
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

/** Whichever came last wins: a clear after a compaction throws the summary away too, and a compaction after a clear starts from what is left. */
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
 * From the boundary or just after it, depending on the note, and without the
 * notes that are only for the reader. That filter is what a slice alone cannot
 * do: a boundary is the last of its kind, but a context report sits wherever it
 * was asked for.
 */
export function messagesInContext(messages: Message[]): Message[] {
	const { index, note } = conversationBoundary(messages);
	if (!note) return messages.filter((message) => !message.note);

	const boundary = messages[index];
	const from = boundaryOf(note.kind) === 'from' ? index : index + 1;
	return messages.slice(from).filter((message) => message === boundary || !message.note);
}
