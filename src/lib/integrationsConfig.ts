import { derived, writable } from 'svelte/store';

import { DEFAULT_BOTS_PER_USER } from '$lib/integrations';

/**
 * What this account may do with bots, as the instance answers it.
 *
 * Read at boot rather than when the settings window opens, so the tab is either
 * there or not from the first render. A tab that appears a moment later, or one
 * that appears and then says it is not for you, is worse than its absence.
 */
export interface IntegrationsConfig {
	/** Whether this account may run bots at all. */
	canManage: boolean;
	/** Whether it may also see and stop everybody else's. */
	isAdmin: boolean;
	/** How many one account may run. */
	limit: number;
}

/** Before the instance has answered: the closed reading, since this is a grant. */
const DEFAULT: IntegrationsConfig = {
	canManage: false,
	isAdmin: false,
	limit: DEFAULT_BOTS_PER_USER
};

const fromServer = writable<IntegrationsConfig | null>(null);

export async function loadIntegrationsConfig(): Promise<void> {
	try {
		const response = await fetch('/api/integrations/config');
		if (response.ok) fromServer.set(await response.json());
	} catch {
		/* leave null, which reads as "not allowed" */
	}
}

export const integrationsConfig = derived(
	fromServer,
	($server): IntegrationsConfig => $server ?? DEFAULT
);
