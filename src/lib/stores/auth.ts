import { writable } from 'svelte/store';

export interface CurrentUser {
	id: string;
	email: string;
	role: 'admin' | 'user';
}

/** The signed-in user in server mode (null in local mode or when signed out). */
export const currentUser = writable<CurrentUser | null>(null);
