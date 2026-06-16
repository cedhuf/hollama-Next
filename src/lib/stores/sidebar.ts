import { writable } from 'svelte/store';

/**
 * Mobile drawer open/close — transient (starts closed on every load) and decoupled
 * from the persisted desktop `sidebarExpanded` rail/full preference. A drawer should
 * never "remember" being open across reloads.
 */
export const mobileDrawerOpen = writable(false);
