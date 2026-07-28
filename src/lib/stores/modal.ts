import { writable } from 'svelte/store';

export const settingsModalOpen = writable(false);
export const onboardingOpen = writable(false);
/** Server-mode welcome tour, shown once on a user's first connection. */
export const welcomeOpen = writable(false);
