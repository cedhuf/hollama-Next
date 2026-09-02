import { writable } from 'svelte/store';

/** Transient, starting closed on every load, and separate from the persisted desktop `sidebarExpanded`: a drawer should never remember being open. */
export const mobileDrawerOpen = writable(false);
