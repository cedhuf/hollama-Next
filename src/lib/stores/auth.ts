import { derived, writable } from 'svelte/store';

export interface CurrentUser {
	id: string;
	email: string;
	role: 'admin' | 'user';
	/** True when this session was authenticated via OIDC (email owned by the IdP). */
	oidc?: boolean;
}

/** The current user, or null when signed out. */
export const currentUser = writable<CurrentUser | null>(null);

/** An instance with no accounts still has a role, because it still has a user: its implicit owner, who is an admin. */
export const currentRole = derived(currentUser, (user): 'admin' | 'user' => user?.role ?? 'user');
