import { writable } from 'svelte/store';

export const settingsModalOpen = writable(false);

/**
 * The way out of a settings sub-view, lifted to the modal's own header.
 *
 * A sub-view carrying its own back button put two headers on top of each other:
 * the modal's, and the one the panel drew for itself. The sub-view still owns the
 * state, it just publishes the way back here and the modal draws it in the bar it
 * already has. Registered on mount, cleared on destroy, so nothing has to
 * remember to tidy up when a tab changes.
 */
export const settingsBack = writable<{ label: string; onBack: () => void } | null>(null);

/** Server-mode welcome tour, shown once on a user's first connection. */
export const welcomeOpen = writable(false);

/**
 * Play the tour with every step in it, whatever this account already has.
 *
 * The tour composes itself: the connection step is absent once there is a
 * connection, the profile step once there is a name. Which is right, and which
 * means nobody can look at the whole thing without emptying their account first.
 * This is the developer-options way in, and it changes nothing else: the steps
 * shown are the real ones, in the real order.
 */
export const welcomeShowAll = writable(false);

/**
 * Conversation search. Global because it answers to ⌘K from anywhere, and the
 * sidebar hands its filter text over when the user asks for the whole corpus.
 */
export const searchModalOpen = writable(false);
export const searchModalQuery = writable('');

export function openSearch(query = ''): void {
	searchModalQuery.set(query);
	searchModalOpen.set(true);
}

/**
 * The knowledge editor.
 *
 * A dialog rather than a page: a collection is something you write down beside
 * what you are doing, usually without leaving the conversation that made you
 * want to write it. Sending people to a route for that lost the conversation,
 * and meant the same editor had to exist twice once anything else needed it.
 */
export interface KnowledgeDraft {
	/** Existing knowledge to edit, or nothing to start a new one. */
	id?: string;
	name?: string;
	content?: string;
	/** Which collection a new one lands in, when opened from inside one. */
	collectionId?: string;
}

export const knowledgeModalOpen = writable(false);
export const knowledgeDraft = writable<KnowledgeDraft>({});

export function openKnowledge(draft: KnowledgeDraft = {}): void {
	knowledgeDraft.set(draft);
	knowledgeModalOpen.set(true);
}
