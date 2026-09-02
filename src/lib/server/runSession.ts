import { buildMentionNote, mentionRecorded } from '$lib/chat/mentionRecord';
import type { RunEvent } from '$lib/chat/run/types';
import type { Message, Session } from '$lib/sessions';

import { getItem, getPersonas, upsertItem } from './db/collections';

/**
 * The conversation, written by whoever is producing it.
 *
 * A turn runs here and the browser only watches. In the page it meant an answer
 * was durable only while somebody had it open, and that another client had to
 * reimplement the reduction exactly or corrupt a conversation by following it.
 *
 * Only the events that change the stored conversation are handled. Read and
 * written back per event rather than held open for the turn: a conversation is
 * edited from the page while its turn runs, and a copy loaded at the start would
 * put all of that back.
 */
export function sessionWriter(userId: string, sessionId: string): (event: RunEvent) => void {
	const change = (apply: (session: Session) => Session | null): void => {
		try {
			const session = getItem<Session>('sessions', userId, sessionId);
			// The conversation has been deleted while its turn was running, which is a
			// thing people do.
			if (!session) return;
			const next = apply(session);
			if (next) upsertItem('sessions', userId, next);
		} catch (error) {
			// A failed write must not take the turn down: what the model is saying still
			// reaches whoever is watching.
			console.error(`Could not write conversation ${sessionId}:`, error);
		}
	};

	return (event: RunEvent): void => {
		switch (event.type) {
			case 'message':
				change((session) => {
					// A persona called in leaves a record in its own conversation, so opening it
					// later is not like nothing happened. Here rather than in the page: a persona
					// answering into a tab nobody had open was remembering nowhere.
					if (event.message.personaId) recordMention(userId, session, event.message);
					return {
						...session,
						messages: [...session.messages, event.message],
						updatedAt: event.message.createdAt ?? new Date().toISOString()
					};
				});
				return;

			case 'compaction':
				change((session) => ({
					...session,
					messages: [...session.messages, event.marker],
					updatedAt: new Date().toISOString()
				}));
				return;

			case 'title':
				change((session) => {
					// Never over a name someone typed, and never a third time. The run cannot know
					// either: it was asked before the turn went out, and the conversation may have
					// been renamed since, which is why the row is read again here.
					if (session.titleEdited) return null;
					return {
						...session,
						title: event.title,
						titleRegenerated: session.title ? true : session.titleRegenerated,
						updatedAt: new Date().toISOString()
					};
				});
				return;

			default:
				return;
		}
	};
}

/** A persona nobody has opened has no conversation, and this does not create one: a conversation appearing in the sidebar because you mentioned somebody once is one you did not start. */
function recordMention(userId: string, source: Session, reply: Message): void {
	const persona = getPersonas(userId).find((p) => p.id === reply.personaId);
	if (!persona?.sessionId) return;
	// Mentioning a persona inside its own conversation is not being called away:
	// the exchange is already there, and a record would be the same two messages.
	if (persona.sessionId === source.id) return;

	const note = buildMentionNote(source, reply);
	if (!note) return;

	const target = getItem<Session>('sessions', userId, persona.sessionId);
	if (!target || mentionRecorded(target, note.generatedAt)) return;

	const recorded: Session = {
		...target,
		messages: [
			...target.messages,
			{ role: 'system', content: '', createdAt: note.generatedAt, note }
		],
		updatedAt: note.generatedAt
	};
	upsertItem('sessions', userId, recorded);
}
