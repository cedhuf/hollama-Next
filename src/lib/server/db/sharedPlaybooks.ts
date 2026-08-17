import type { Playbook } from '$lib/playbooks';

import { getConfig, setConfig } from './config';

/**
 * What an instance offers its users, which is two lists and not one.
 *
 * The personas' arrangement, for the same reason it exists there. An admin
 * shares in two different senses: sharing **their** playbook means handing out
 * something they wrote, which lives in their library and which users get a copy
 * of; sharing one **from the store** means saying "this instance also offers
 * Meals for the week", which is not something they wrote at all.
 *
 * Collapsed into one list, the second became a copy of the store's playbook
 * sitting beside the store's playbook, and a copy freezes: the store's next
 * revision never reached the people who took the admin's.
 *
 * So a relay is a reference. `sharedPlaybooks` holds what an admin wrote;
 * `sharedCatalogPlaybookIds` holds the store ids they relay. Which also means an
 * admin can install one, rewrite half of it, and share that as their own, with
 * the store's original still listed beside it.
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
