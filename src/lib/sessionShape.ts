import type { Message, Session } from '$lib/sessions';
import type { Model } from '$lib/settings';

/**
 * The pure shape of a conversation: how a list sees it, and what a conversation
 * coming out of storage has to be filled in with.
 *
 * Deliberately its own module, importing nothing but types. `sessions.ts` pulls
 * in the stores and the chat defaults, which in turn read the stores back — so
 * the moment the store layer needed a *value* from there rather than a type, the
 * two started initialising each other and `settingsStore` was read before it
 * existed. Pure functions with no dependencies can be imported from anywhere,
 * including the store layer and the server.
 */

/** Longest title derived from a first message. */
export const MAX_TITLE_LENGTH = 56;

/**
 * A conversation as the lists know it: everything but what was said.
 *
 * The sidebar, the home page and the model history need a title, a date, a model
 * and a couple of flags. They never needed the messages — but the store held
 * them anyway, so every boot and every refresh shipped the whole history to the
 * browser and kept it in memory. A distinct type rather than a `Session` with an
 * empty `messages`: that shape would be indistinguishable from a conversation
 * whose messages were genuinely lost, and saving one would destroy the real one.
 * Here it cannot be saved as a session at all.
 */
export interface SessionSummary {
	id: string;
	/** Already resolved: an explicit title, or the fallback below. */
	title: string;
	updatedAt?: string;
	model?: Model;
	pinned?: boolean;
	personaId?: string;
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
		personaId: session.personaId
	};
}

export const defaultSystemPrompt = (): Message => ({ role: 'system', content: '' });

/**
 * Fill in fields that conversations written before they existed don't carry.
 * Applied on the way out of storage, so the rest of the app can assume them.
 */
export const normalizeSession = (session: Session): Session => ({
	...session,
	options: session.options || {},
	systemPrompt: session.systemPrompt || defaultSystemPrompt()
});
