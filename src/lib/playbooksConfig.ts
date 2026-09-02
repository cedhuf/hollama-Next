import { derived, get, writable } from 'svelte/store';

import { playbooksStore } from '$lib/localStorage';
import type { Playbook } from '$lib/playbooks';

/**
 * What this instance offers in playbooks, as the browser knows it.
 *
 * The personas' twin, deliberately: the two catalogues share a storefront and a
 * store address, and one list holding both would have to say which is which on
 * every row anyway.
 *
 * Not duplicated is the policy: whether a user's store shows the public
 * catalogue or only what the instance relays is a decision about the store.
 */

export interface PlaybooksConfig {
	/** Playbooks an admin has shared, offered to users to install. */
	shared: Playbook[];
	/** Store playbooks this instance relays, by catalogue id. */
	sharedFromStore: string[];
	storeMode: 'open' | 'curated';
	/** Whether the current user may offer a playbook to everyone on the instance. */
	canShare: boolean;
}

const DEFAULT: PlaybooksConfig = {
	shared: [],
	sharedFromStore: [],
	// Before the instance has answered: the permissive reading of what is shown, and
	// nothing shared, since sharing is the instance's to grant.
	storeMode: 'open',
	canShare: false
};

const serverPlaybooks = writable<PlaybooksConfig | null>(null);

export async function loadServerPlaybooks(): Promise<void> {
	try {
		const response = await fetch('/api/playbooks/config');
		if (response.ok) serverPlaybooks.set(await response.json());
	} catch {
		/* leave null */
	}
}

export const playbooksConfig = derived(
	serverPlaybooks,
	($server): PlaybooksConfig => $server ?? DEFAULT
);

/** Only their own. What they relay from the store is a separate list of ids, so a toggle here cannot disturb it. */
export async function publishSharedPlaybooks(): Promise<void> {
	const shared = (get(playbooksStore) || []).filter((playbook) => playbook.shared);
	try {
		await fetch('/api/admin/playbooks', {
			method: 'PUT',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(shared)
		});
		await loadServerPlaybooks();
	} catch {
		/* ignore */
	}
}

/** Admin: relay one of the store's playbooks, or stop. */
export async function relayCatalogPlaybook(id: string, relay: boolean): Promise<void> {
	await fetch(`/api/admin/playbooks/store/${encodeURIComponent(id)}`, {
		method: relay ? 'PUT' : 'DELETE'
	});
	await loadServerPlaybooks();
}
