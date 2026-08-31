import { isRunnable } from '$lib/integrations';
import {
	getIntegrationSecret,
	listAllIntegrations,
	type IntegrationRecord
} from '$lib/server/db/integrations';

import { providerFor } from './registry';
import type { IntegrationRuntime } from './types';

/**
 * Who is running, and keeping that answer equal to what the database says.
 *
 * In memory and in this process, exactly like the run registry next door and
 * for the same reasons: what is held here is a timer and a socket's worth of
 * state, both of which a restart is entitled to lose. Two replicas would each
 * run their own copy of every bot and answer everything twice, which is the one
 * real limit of doing it this way and is fixed, the day it matters, by electing
 * a single watcher rather than by making this file cleverer.
 *
 * Nothing subscribes to the database, so every mutation calls `reconcile()`.
 * That is one line in each route and it is the whole synchronisation story.
 */

interface Running {
	runtime: IntegrationRuntime;
	/** What it was started with, so an edit that changes nothing restarts nothing. */
	fingerprint: string;
}

const running = new Map<string, Running>();

/**
 * Everything that decides how a bot behaves, in one string.
 *
 * The credential is in it by presence only: rotating a key has to restart the
 * worker, and the key itself has no business being held in a comparison table.
 */
function fingerprintOf(record: IntegrationRecord): string {
	return JSON.stringify({
		kind: record.kind,
		config: record.config,
		hasSecret: record.hasSecret,
		owner: record.ownerUserId
	});
}

function stop(id: string): void {
	const current = running.get(id);
	if (!current) return;
	try {
		current.runtime.stop();
		console.log(`[integration ${id}] stopped`);
	} catch (error) {
		// A runtime that throws on the way out has already stopped mattering.
		console.error(`[integration ${id}] failed to stop cleanly:`, error);
	}
	running.delete(id);
}

/**
 * Start what should be running, stop what should not, restart what changed.
 *
 * Safe to call at any time and as often as wanted: it compares rather than
 * assumes, so a route that calls it after every write is doing the right thing
 * even when the write changed nothing.
 */
export function reconcile(): void {
	let wanted: IntegrationRecord[];
	try {
		wanted = listAllIntegrations().filter(
			// Two switches answering two questions: the owner's `enabled` says
			// whether they want it running, the instance's `blocked` says whether it
			// is allowed to. It runs when both agree, and neither speaks for the other.
			(record) =>
				record.enabled && !record.blocked && isRunnable(record) && !!providerFor(record.kind)
		);
	} catch (error) {
		// No database yet, or one that cannot be opened. Nothing to supervise, and
		// nothing worth taking a request down for.
		console.error('[integrations] could not read the configuration:', error);
		return;
	}

	const keep = new Set(wanted.map((record) => record.id));
	for (const id of [...running.keys()]) {
		if (!keep.has(id)) stop(id);
	}

	for (const record of wanted) {
		const fingerprint = fingerprintOf(record);
		const current = running.get(record.id);
		if (current?.fingerprint === fingerprint) continue;
		if (current) stop(record.id);

		try {
			// Read here rather than inside the provider, so nothing under this file
			// has to know where credentials are kept or how they are encrypted.
			const token = getIntegrationSecret(record.id);
			if (!token) {
				console.warn(`[integration ${record.id}] no API key stored, not starting`);
				continue;
			}
			const runtime = providerFor(record.kind).start(record, token);
			running.set(record.id, { runtime, fingerprint });
			console.log(`[integration ${record.id}] started (${record.kind}, ${record.config.baseUrl})`);
		} catch (error) {
			// One integration that will not start must not stop the others.
			console.error(`[integration ${record.id}] failed to start:`, error);
		}
	}
}

let started = false;

/**
 * Bring the supervisor up, once.
 *
 * Called from the first request rather than at import time: the module graph is
 * loaded during the build too, and a build that opens the database and starts
 * polling a chat server is a build that does something nobody asked for.
 */
export function ensureIntegrationsStarted(): void {
	if (started) return;
	started = true;
	reconcile();
}

/** Which integrations this process currently has running. For diagnostics. */
export function runningIntegrationIds(): string[] {
	return [...running.keys()];
}

/**
 * Vite replaces this module when it is edited, and the replacement starts with
 * an empty map while the previous copy's timers keep firing. The result looks
 * exactly like a broken switch: a bot answering twice from one instance, and a
 * worker no button can reach because nothing holds a reference to it any more.
 */
if (import.meta.hot) {
	import.meta.hot.dispose(() => {
		for (const id of [...running.keys()]) stop(id);
	});
}
