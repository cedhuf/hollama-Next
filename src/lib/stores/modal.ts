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
