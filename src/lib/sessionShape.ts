import { stripLoadOptions } from '$lib/chat/options';
import type { Message, Session } from '$lib/sessions';
import type { Model } from '$lib/settings';

/**
 * The pure shape of a conversation: how a list sees it, and what one coming out
 * of storage has to be filled in with.
 *
 * Its own module, importing nothing with a runtime dependency. `sessions.ts`
 * pulls in the stores and the chat defaults, which read the stores back, so the
 * moment the store layer needed a *value* from there the two started
 * initialising each other and `settingsStore` was read before it existed.
 */

/** Longest title derived from a first message. */
export const MAX_TITLE_LENGTH = 56;

/**
 * A conversation as the lists know it: everything but what was said.
 *
 * They never needed the messages, but the store held them, so every boot shipped
 * the whole history to the browser. A distinct type rather than a `Session` with
 * an empty `messages`: that shape is indistinguishable from a conversation whose
 * messages were genuinely lost, and saving one would destroy the real one.
 */
export interface SessionSummary {
	id: string;
	/** Already resolved: an explicit title, or the fallback below. */
	title: string;
	updatedAt?: string;
	model?: Model;
	pinned?: boolean;
	personaId?: string;
	archived?: boolean;
}

/** The title a conversation shows in a list: its own, or its first words. */
export function resolveSessionTitle(session: { title?: string; messages?: Message[] }): string {
	if (session.title) return session.title;
	const firstUserMessage = session.messages?.find(
		(m) => m.role === 'user' && m.content && !m.knowledge
	);
	return (firstUserMessage?.content ?? '').slice(0, MAX_TITLE_LENGTH);
}

export function summarizeSession(session: Session): SessionSummary {
	return {
		id: session.id,
		title: resolveSessionTitle(session),
		updatedAt: session.updatedAt,
		model: session.model,
		pinned: session.pinned,
		personaId: session.personaId,
		archived: session.archived
	};
}

export const defaultSystemPrompt = (): Message => ({ role: 'system', content: '' });

/** Fields that conversations written before they existed do not carry. Applied on the way out of storage, so the rest of the app can assume them. */
export const normalizeSession = (session: Session): Session => ({
	...session,
	// The loading options are stripped rather than migrated in place: they describe
	// the machine and now live on the connection. On the way out of storage, so it
	// covers an export restored from months ago as well as a row already stored, and
	// nothing has to be rewritten in bulk.
	options: stripLoadOptions(session.options),
	systemPrompt: session.systemPrompt || defaultSystemPrompt()
});
