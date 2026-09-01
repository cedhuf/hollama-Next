import { get, writable } from 'svelte/store';

import { browser } from '$app/environment';
import { LOCAL_STORAGE_PREFIX } from '$lib/data/keys';
import { playbooksStore } from '$lib/localStorage';
import { playbookDigest } from '$lib/playbookDigest';
import { newPlaybook, savePlaybook, type Playbook } from '$lib/playbooks';
import {
	parsePlaybookBundle,
	parsePlaybookIndex,
	type PlaybookBundle,
	type PlaybookCatalog,
	type PlaybookCatalogEntry
} from '$lib/playbookStore';
import { catalogBase } from '$lib/store';

/**
 * The store of playbooks you can install, which is not part of the application.
 *
 * The persona catalogue's twin, working the same way for the same reasons.
 *
 * Not folded into one client: they agree on the mechanism and disagree on
 * everything it carries, so a single client taking a schema, a parser, a store
 * and an installer as parameters would be the same code with the differences
 * moved into its arguments. What is genuinely shared is imported.
 */

const CACHE_KEY = `${LOCAL_STORAGE_PREFIX}-playbook-catalog`;

export type PlaybookCatalogState =
	| { status: 'idle' }
	| { status: 'loading' }
	| { status: 'ready'; catalog: PlaybookCatalog; stale: boolean }
	| { status: 'error'; message: string };

const state = writable<PlaybookCatalogState>({ status: 'idle' });

export const playbookCatalogState = { subscribe: state.subscribe };

function base(): string {
	return catalogBase('playbooks');
}

function readCache(): PlaybookCatalog | undefined {
	if (!browser) return undefined;
	try {
		const raw = localStorage.getItem(CACHE_KEY);
		if (!raw) return undefined;
		const cached = JSON.parse(raw) as { entries?: unknown; fetchedAt?: string };
		const entries = parsePlaybookIndex({ format: 'llooma.playbooks', entries: cached.entries });
		if (!entries?.length) return undefined;
		return { entries, fetchedAt: cached.fetchedAt ?? '' };
	} catch {
		return undefined;
	}
}

function writeCache(catalog: PlaybookCatalog): void {
	if (!browser) return;
	try {
		localStorage.setItem(CACHE_KEY, JSON.stringify(catalog));
	} catch {
		/* a full quota is not worth failing a page for */
	}
}

/** The cached listing shows immediately and is marked stale, so the page never waits on a request. A failed fetch leaves it standing: a slightly old listing beats none. */
export async function loadPlaybookCatalog(force = false): Promise<void> {
	const current = get(state);
	if (!force && current.status === 'ready' && !current.stale) return;
	if (!force && current.status === 'loading') return;

	const cached = readCache();
	if (cached) state.set({ status: 'ready', catalog: cached, stale: true });
	else state.set({ status: 'loading' });

	try {
		// `fresh` pierces the instance's own hold on the listing: without it, pressing
		// Refresh did nothing for up to fifteen minutes and nothing said so.
		const response = await fetch(`${base()}index.json${force ? '?fresh=1' : ''}`, {
			headers: { accept: 'application/json' }
		});
		if (!response.ok) throw new Error(`HTTP ${response.status}`);

		const entries = parsePlaybookIndex(await response.json());
		if (!entries) throw new Error('not a playbook listing');

		const catalog: PlaybookCatalog = { entries, fetchedAt: new Date().toISOString() };
		writeCache(catalog);
		state.set({ status: 'ready', catalog, stale: false });
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		if (cached) state.set({ status: 'ready', catalog: cached, stale: true });
		else state.set({ status: 'error', message });
	}
}

async function sha256(bytes: ArrayBuffer): Promise<string | undefined> {
	if (!globalThis.crypto?.subtle) return undefined;
	const digest = await crypto.subtle.digest('SHA-256', bytes);
	return `sha256-${btoa(String.fromCharCode(...new Uint8Array(digest)))}`;
}

/** The listing's `integrity` is checked against the bytes as they arrived. A mismatch is refused: the two came from the same place, so disagreeing means one is stale. */
export async function fetchPlaybookBundle(entry: PlaybookCatalogEntry): Promise<PlaybookBundle> {
	const response = await fetch(`${base()}${entry.path}`, {
		headers: { accept: 'application/json' }
	});
	if (!response.ok) throw new Error(`HTTP ${response.status}`);

	const bytes = await response.arrayBuffer();
	if (entry.integrity) {
		const actual = await sha256(bytes);
		if (actual && actual !== entry.integrity) throw new Error('integrity check failed');
	}

	const bundle = parsePlaybookBundle(JSON.parse(new TextDecoder().decode(bytes)));
	if (!bundle) throw new Error('not a playbook bundle');
	return bundle;
}

/** The fields a bundle contributes, mapped onto a playbook of your own. */
function fromBundle(bundle: PlaybookBundle, base: Playbook): Playbook {
	return {
		...base,
		name: bundle.playbook.name,
		summary: bundle.playbook.summary ?? '',
		instructions: bundle.playbook.instructions,
		tags: bundle.playbook.tags?.length ? bundle.playbook.tags : undefined
	};
}

/**
 * A copy, not a link: it lands with a fresh id and is yours from that moment,
 * and the store cannot reach into it. What is recorded is where it came from and
 * what it said on the way in, so "you edited this" and "the store moved on" can
 * be told apart.
 */
export function installPlaybookBundle(
	bundle: PlaybookBundle,
	source: { origin: 'official' | 'community' | 'file'; id?: string; revision?: number }
): Playbook {
	const playbook = fromBundle(bundle, newPlaybook());
	playbook.source = {
		...source,
		digest: playbookDigest(bundle.playbook)
	};
	savePlaybook(playbook);
	return playbook;
}

/** Bring an installed copy back up to the store's current version. */
export function applyBundleToPlaybook(
	playbook: Playbook,
	bundle: PlaybookBundle,
	source: { origin: 'official' | 'community'; id: string; revision?: number }
): void {
	const updated = fromBundle(bundle, playbook);
	updated.source = {
		...source,
		digest: playbookDigest(bundle.playbook)
	};
	savePlaybook(updated);
}

/** Two comparisons: against the playbook as it stands, have *you* changed it; against the listing, has the *store*. Without the second, a new revision upstream makes an untouched copy look edited. */
export type PlaybookState = 'own' | 'clean' | 'edited' | 'outdated' | 'edited-outdated';

export function playbookState(playbook: Playbook, published?: string): PlaybookState {
	if (!playbook.source?.id) return 'own';

	const now = playbookDigest(playbook);
	const edited = !!playbook.source.digest && now !== playbook.source.digest;
	const moved = !!published && !!playbook.source.digest && published !== playbook.source.digest;

	if (edited && moved) return 'edited-outdated';
	if (edited) return 'edited';
	if (moved) return 'outdated';
	return 'clean';
}

/** The installed copy of a catalogue entry, if there is one. */
export function installedFrom(id: string): Playbook | undefined {
	return (get(playbooksStore) ?? []).find((playbook) => playbook.source?.id === id);
}
