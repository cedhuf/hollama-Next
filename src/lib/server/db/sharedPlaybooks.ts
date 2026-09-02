import type { Playbook } from '$lib/playbooks';

import { getConfig, setConfig } from './config';

/**
 * What an instance offers its users, which is two lists and not one. The
 * personas' arrangement, for the same reason: sharing **their** playbook hands
 * out something they wrote, sharing one **from the store** does not.
 *
 * As one list, the second became a copy sitting beside the store's own, and a
 * copy freezes. So `sharedPlaybooks` holds what an admin wrote, and
 * `sharedCatalogPlaybookIds` the store ids they relay.
 */
const PLAYBOOKS = 'sharedPlaybooks';
const CATALOG_IDS = 'sharedCatalogPlaybookIds';

/** The playbooks an admin wrote and flagged `shared`, as a snapshot of their library. */
export function sharedPlaybooks(): Playbook[] {
	try {
		const raw = getConfig(PLAYBOOKS);
		return raw ? (JSON.parse(raw) as Playbook[]) : [];
	} catch {
		return [];
	}
}

export function setSharedPlaybooks(list: Playbook[]): void {
	setConfig(PLAYBOOKS, JSON.stringify(list));
}

/** The store playbooks this instance relays, by their catalogue id. */
export function sharedCatalogPlaybookIds(): string[] {
	try {
		const raw = getConfig(CATALOG_IDS);
		const parsed = raw ? (JSON.parse(raw) as unknown) : [];
		return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
	} catch {
		return [];
	}
}

export function relayCatalogPlaybook(id: string): void {
	const ids = sharedCatalogPlaybookIds();
	if (!ids.includes(id)) setConfig(CATALOG_IDS, JSON.stringify([...ids, id]));
}

export function stopRelayingCatalogPlaybook(id: string): void {
	setConfig(CATALOG_IDS, JSON.stringify(sharedCatalogPlaybookIds().filter((it) => it !== id)));
}
