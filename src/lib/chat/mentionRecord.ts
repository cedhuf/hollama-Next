import type { Message, Session } from '$lib/sessions';
import { resolveSessionTitle } from '$lib/sessionShape';

import type { MentionNote } from './notes';

/**
 * Keeping a persona's own conversation aware of where else it has spoken.
 *
 * A persona answers wherever it is called with `@`, and until now that answer
 * existed only in the conversation it was called into. Open the persona
 * afterwards and it was as if nothing had happened, which is wrong for the one
 * object in the app that is supposed to be an ongoing relationship.
 *
 * So each reply leaves a note behind, in the persona's conversation, holding the
 * question and the answer. Only those two. A record of the whole thread would
 * copy somebody else's conversation into this one, and the record is offered to
 * the model on request, where anything bigger would be spending a context window
 * on a thread the persona was not part of.
 *
 * What is here is only the note itself, decided from two conversations and
 * nothing else. Writing it is the business of whoever is producing the reply,
 * which is the run.
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
		// The reply's own timestamp identifies the exchange, so the same answer
		// cannot leave two records however many times it is read.
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
