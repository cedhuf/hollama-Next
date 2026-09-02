import { derived, writable } from 'svelte/store';

import { MCP_LIMITS } from '$lib/mcp';

/** Read at boot like the other governance answers, because the composer's tool menu is drawn from it: a switch that appears a moment after the page is worse than its absence. */
export interface McpConfig {
	/** Whether this account may add servers of its own. */
	canManage: boolean;
	isAdmin: boolean;
	limit: number;
	/** Whether any server is configured and switched on, which is what the menu asks. */
	hasServers: boolean;
}

/** Before the instance has answered: nothing offered, since this is a grant. */
const DEFAULT: McpConfig = {
	canManage: false,
	isAdmin: false,
	limit: MCP_LIMITS.perUser,
	hasServers: false
};

const fromServer = writable<McpConfig | null>(null);

export async function loadMcpConfig(): Promise<void> {
	try {
		const response = await fetch('/api/mcp/config');
		if (response.ok) fromServer.set(await response.json());
	} catch {
		/* leave null, which reads as "nothing here" */
	}
}

export const mcpConfig = derived(fromServer, ($server): McpConfig => $server ?? DEFAULT);
