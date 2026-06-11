import { derived, writable } from 'svelte/store';

import { env } from '$env/dynamic/public';

export interface CurrentUser {
	id: string;
	email: string;
	role: 'admin' | 'user';
	/** True when this session was authenticated via OIDC (email owned by the IdP). */
	oidc?: boolean;
}

/** The signed-in user in server mode (null in local mode or when signed out). */
export const currentUser = writable<CurrentUser | null>(null);

/**
 * The effective role: from the session in server mode, and always `admin` in
 * local mode (single user, full control). This is the real, non-editable role.
 */
export const currentRole = derived(currentUser, (user): 'admin' | 'user' =>
	env.PUBLIC_MODE === 'server' ? (user?.role ?? 'user') : 'admin'
);
