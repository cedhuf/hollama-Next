import { buildMentionNote, mentionRecorded } from '$lib/chat/mentionRecord';
import type { RunEvent } from '$lib/chat/run/types';
import type { Message, Session } from '$lib/sessions';

import { getItem, getPersonas, upsertItem } from './db/collections';

/**
 * The conversation, written by whoever is producing it.
 *
 * A turn runs here and the browser only watches, so this is where its result has
 * to land. It used to land in the page: the events went out over the stream, a
 * tab reduced them into the conversation and saved it back. Which meant an
 * answer was durable only while somebody had it open, and it meant that anybody
 * writing another client had to reimplement the reduction exactly or corrupt a
 * conversation by following it.
 *
 * Only the events that change the stored conversation are handled. The rest of
 * the log describes a turn in progress (fragments of text, what is being looked
 * up, which round it is on), which is worth drawing and not worth storing.
 *
 * Read and written back per event rather than held open for the length of the
 * turn: a conversation is edited from the page while its turn runs, notes get
 * appended, a playbook is switched on, and a copy loaded when the turn started
 * would put all of that back the way it was. There are a handful of these events
 * per turn, not one per token, so the cost is a JSON round trip a few times a
 * minute.
 */
export function sessionWriter(userId: string, sessionId: string): (event: RunEvent) => void {
	const change = (apply: (session: Session) => Session | null): void => {
		try {
			const session = getItem<Session>('sessions', userId, sessionId);
			// The conversation has been deleted while its turn was running, which is a
			// thing people do. Nothing to write it into, and nothing to complain about.
			if (!session) return;
			const next = apply(session);
			if (next) upsertItem('sessions', userId, next);
		} catch (error) {
			// A failed write must not take the turn down with it: what the model is
			// saying still reaches whoever is watching, and the ending still arrives.
			console.error(`Could not write conversation ${sessionId}:`, error);
		}
	};

	return (event: RunEvent): void => {
		switch (event.type) {
			case 'message':
				change((session) => {
					// A persona that was called in leaves a record in its own
					// conversation, so opening it later is not like nothing happened.
					// Here rather than in the page for the same reason as everything else
					// in this file: a persona answering into a tab nobody had open was
					// remembering nowhere.
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
					// Never over a name someone typed, and never a third time. The run
					// cannot know either: it was asked for a title before the turn went
					// out, and the conversation may have been renamed while it was being
					// written. Which is exactly why the row is read again here.
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

/**
 * Write the record, unless there is nowhere to write it.
 *
 * A persona nobody has opened yet has no conversation of its own, and this does
 * not create one: a conversation appearing in the sidebar because you mentioned
 * somebody once is a conversation you did not start. The record is skipped, and
 * the exchange still lives where it happened.
 */
function recordMention(userId: string, source: Session, reply: Message): void {
	const persona = getPersonas(userId).find((p) => p.id === reply.personaId);
	if (!persona?.sessionId) return;
	// Mentioning a persona inside its own conversation is not being called away:
	// the exchange is already right there, and a record of it would be the same
	// two messages a second time.
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
