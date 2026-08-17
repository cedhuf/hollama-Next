import { get } from 'svelte/store';

import { repository } from '$lib/data';
import { personasStore } from '$lib/localStorage';
import { saveSession, type Message, type Session } from '$lib/sessions';
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
 */

/** Roughly a page of text each way, past which a record stops being a record. */
const MAX_RECORDED = 4000;

function trim(text: string): string {
	const clean = text.trim();
	return clean.length > MAX_RECORDED ? `${clean.slice(0, MAX_RECORDED)}…` : clean;
}

/**
 * Write the record, unless there is nowhere to write it.
 *
 * A persona nobody has opened yet has no conversation of its own, and this does
 * not create one: a conversation appearing in the sidebar because you mentioned
 * somebody once is a conversation you did not start. The record is skipped, and
 * the exchange still lives where it happened.
 */
export async function recordMention(
	personaId: string,
	source: Session,
	reply: Message
): Promise<void> {
	const persona = (get(personasStore) ?? []).find((p) => p.id === personaId);
	if (!persona?.sessionId) return;
	// Mentioning a persona inside its own conversation is not being called away:
	// the exchange is already right there, and a record of it would be the same
	// two messages a second time.
	if (persona.sessionId === source.id) return;

	const asked = [...source.messages].reverse().find((m) => m.role === 'user' && !m.knowledge);
	if (!asked?.content || !reply.content) return;

	const session = await repository.loadSession(persona.sessionId);
	if (!session) return;

	const at = reply.createdAt ?? new Date().toISOString();
	// The reply's own timestamp identifies the exchange, so a replayed run and a
	// second tab cannot both leave the same record.
	const already = session.messages.some(
		(message) => message.note?.kind === 'mention' && message.note.generatedAt === at
	);
	if (already) return;

	const note: MentionNote = {
		kind: 'mention',
		generatedAt: at,
		sessionId: source.id,
		title: resolveSessionTitle(source),
		asked: trim(asked.content),
		answered: trim(reply.content)
	};

	saveSession({
		...session,
		messages: [...session.messages, { role: 'system', content: '', createdAt: at, note }],
		updatedAt: at
	});
}
