import { env as privateEnv } from '$env/dynamic/private';
import { env as publicEnv } from '$env/dynamic/public';
import { getConfig } from '$lib/server/db/config';
import type { Settings } from '$lib/settings';

export type SearchSharing = 'off' | 'locked' | 'overridable';

export interface ResolvedSearch {
	url: string;
	backend: string;
	token: string;
	editable: boolean;
	source: 'env' | 'admin' | 'user' | 'none';
	/** The admin's shared default (for the "restore" action), when applicable. */
	adminUrl: string;
	adminBackend: string;
}

const envUrl = () => publicEnv.PUBLIC_SEARCH_URL?.trim() || '';
const envBackend = () => publicEnv.PUBLIC_SEARCH_BACKEND?.trim() || 'degoog';
const envToken = () => privateEnv.SEARCH_TOKEN?.trim() || '';

/**
 * Resolve the effective web-search config for a user (server mode):
 *   env (locked) > the user's own (admins always) > the admin-shared config.
 * The admin shares their own config (snapshotted into app_config) — there's a
 * single place to configure it (Chat settings), Admin only chooses the sharing.
 */
export function resolveSearch(userSettings: Settings | null, isAdmin: boolean): ResolvedSearch {
	const own = {
		url: userSettings?.searchUrl?.trim() || '',
		backend: userSettings?.searchBackend || 'degoog',
		token: userSettings?.searchToken || ''
	};

	if (envUrl()) {
		return {
			url: envUrl(),
			backend: envBackend(),
			token: envToken(),
			editable: false,
			source: 'env',
			adminUrl: '',
			adminBackend: ''
		};
	}

	// Admins always edit their own config (sharing is decided separately).
	if (isAdmin) {
		return { ...own, editable: true, source: 'user', adminUrl: '', adminBackend: '' };
	}

	const sharing = (getConfig('searchSharing') as SearchSharing) || 'off';
	const admin = {
		url: getConfig('searchUrl') || '',
		backend: getConfig('searchBackend') || 'degoog',
		token: getConfig('searchToken') || ''
	};

	if (sharing === 'locked' && admin.url) {
		return {
			...admin,
			editable: false,
			source: 'admin',
			adminUrl: admin.url,
			adminBackend: admin.backend
		};
	}

	if (sharing === 'overridable' && admin.url) {
		return own.url
			? { ...own, editable: true, source: 'user', adminUrl: admin.url, adminBackend: admin.backend }
			: {
					...admin,
					editable: true,
					source: 'admin',
					adminUrl: admin.url,
					adminBackend: admin.backend
				};
	}

	// Not shared: each user configures their own.
	return { ...own, editable: true, source: 'user', adminUrl: '', adminBackend: '' };
}
