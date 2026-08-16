import { derived, writable } from 'svelte/store';

/**
 * The decisions an instance makes for everyone on it.
 *
 * Delivered with the page rather than fetched after it, which is the whole
 * reason this is a store filled from `+layout.server.ts` rather than another
 * `load…()` call at boot. A theme that arrives a frame late is a flash of the
 * wrong one, and a tour that arrives after the page has been read is a tour
 * nobody reads.
 *
 * `null` in local mode, where there is one person and nobody to decide for them.
 */
export interface InstanceConfig {
	themeSharing: 'off' | 'locked' | 'overridable';
	themeMode: string;
	themeStyle: string;
	/** When an admin last asked everyone to see the welcome tour again. */
	onboardingEpoch: number;
}

const state = writable<InstanceConfig | null>(null);

export const instanceConfig = { subscribe: state.subscribe };

export function setInstanceConfig(config: InstanceConfig | null): void {
	state.set(config);
}

/**
 * Whether the theme is the instance's rather than yours.
 *
 * Locked means the controls go away rather than being drawn and refused: an
 * instance with a house style has made a decision, and a disabled row of colours
 * only invites someone to wonder why they cannot have them.
 */
export const themeLocked = derived(state, ($config) => $config?.themeSharing === 'locked');
