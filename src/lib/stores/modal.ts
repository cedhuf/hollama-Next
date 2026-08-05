import { writable } from 'svelte/store';

export const settingsModalOpen = writable(false);
export const onboardingOpen = writable(false);
/** Server-mode welcome tour, shown once on a user's first connection. */
export const welcomeOpen = writable(false);

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
