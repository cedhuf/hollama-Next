import type { Message, Session } from '$lib/sessions';
import { resolveSessionTitle } from '$lib/sessionShape';

import type { MentionNote } from './notes';

/**
 * Keeping a persona's own conversation aware of where else it has spoken: it
 * answers wherever it is called with `@`, and that answer existed only in the
 * conversation it was called into.
 *
 * Each reply leaves a note holding the question and the answer, and only those:
 * the whole thread would copy somebody else's conversation into this one.
 *
 * Writing it is the business of the run.
 */

/** Roughly a page of text each way, past which a record stops being a record. */
const MAX_RECORDED = 4000;

function trim(text: string): string {
	const clean = text.trim();
	return clean.length > MAX_RECORDED ? `${clean.slice(0, MAX_RECORDED)}...` : clean;
}

/** The record of one exchange, or nothing when there is no exchange to record. */
export function buildMentionNote(source: Session, reply: Message): MentionNote | null {
	const asked = [...source.messages].reverse().find((m) => m.role === 'user' && !m.knowledge);
	if (!asked?.content || !reply.content) return null;

	return {
		kind: 'mention',
		// The reply's own timestamp identifies the exchange, so the same answer cannot
		// leave two records however many times it is read.
		generatedAt: reply.createdAt ?? new Date().toISOString(),
		sessionId: source.id,
		title: resolveSessionTitle(source),
		asked: trim(asked.content),
		answered: trim(reply.content)
	};
}

/** Whether this exchange has already been recorded in the persona's conversation. */
export function mentionRecorded(session: Session, generatedAt: string): boolean {
	return session.messages.some(
		(message) => message.note?.kind === 'mention' && message.note.generatedAt === generatedAt
	);
}
