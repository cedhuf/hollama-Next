import { derived, writable } from 'svelte/store';

/**
 * The decisions an instance makes for everyone on it.
 *
 * Delivered with the page rather than fetched after it, which is why this is
 * filled from `+layout.server.ts`: a theme that arrives a frame late is a flash
 * of the wrong one, and a tour that arrives after the page has been read is a
 * tour nobody reads.
 */
export interface InstanceConfig {
	/** False on an instance that configured no login method: one owner, no password, and nothing to say about accounts. Everything else is unchanged, which is why this is a field rather than a mode. */
	accounts: boolean;
	themeSharing: 'off' | 'locked' | 'overridable';
	themeMode: string;
	themeStyle: string;
	/** When an admin last asked everyone to see the welcome tour again. */
	onboardingEpoch: number;
	/** Who to write to when the instance refuses something. Null if nobody qualifies. */
	adminEmail: string | null;
	/** Whether a plain user may add a connection of their own. */
	allowUserKeys: boolean;
}

const state = writable<InstanceConfig | null>(null);

export const instanceConfig = { subscribe: state.subscribe };

export function setInstanceConfig(config: InstanceConfig | null): void {
	state.set(config);
}

/** Locked means the controls go away rather than being drawn and refused: a disabled row of colours only invites someone to wonder why they cannot have them. */
export const themeLocked = derived(state, ($config) => $config?.themeSharing === 'locked');

/** False until the server says otherwise, so anything about signing in and out is drawn only where it means something. */
export const hasAccounts = derived(state, ($config) => $config?.accounts === true);
