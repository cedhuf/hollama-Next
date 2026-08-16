import { randomUUID } from 'node:crypto';

import type { RunEvent, RunStatus, RunSummary, SequencedRunEvent } from '$lib/chat/run/types';

/**
 * Turns in flight, held by the process rather than by a tab.
 *
 * This is the whole point of the exercise. A generation belongs to the
 * conversation, not to the window that happened to start it, so it lives here:
 * it keeps going when nobody is listening, it remembers everything it emitted,
 * and a client that comes back after a reload replays the part it missed.
 *
 * In memory on purpose, and only in memory. A restart loses whatever was in
 * flight, and a second replica behind a load balancer has its own map: both are
 * real limits, both are fixed the same way (a shared store) on the day someone
 * runs llooma at that scale. Paying for that now would buy nothing, because the
 * failure it prevents is a server restart landing inside the ten seconds a model
 * takes to answer.
 */

/** How long a finished run stays readable, so a reload can still collect it. */
const RETAIN_MS = 5 * 60 * 1000;

/** A ceiling on runs held at once, so a leak cannot take the process with it. */
const MAX_RUNS = 200;

interface Run {
	id: string;
	sessionId: string;
	/** The owner in server mode. Null in local mode, where there are no accounts. */
	userId: string | null;
	status: RunStatus;
	startedAt: string;
	finishedAt?: number;
	events: SequencedRunEvent[];
	controller: AbortController;
	listeners: Set<(event: SequencedRunEvent) => void>;
}

const runs = new Map<string, Run>();

/** Drop what has been finished long enough that nobody is coming back for it. */
function sweep(): void {
	const now = Date.now();
	for (const [id, run] of runs) {
		if (run.finishedAt && now - run.finishedAt > RETAIN_MS) runs.delete(id);
	}

	// Still over the ceiling after the ordinary sweep: give up the oldest finished
	// runs first, and only then the oldest running ones, which is the least bad
	// order to break a promise in.
	if (runs.size <= MAX_RUNS) return;
	const ordered = [...runs.values()].sort((a, b) => {
		if (!!a.finishedAt !== !!b.finishedAt) return a.finishedAt ? -1 : 1;
		return a.startedAt.localeCompare(b.startedAt);
	});
	for (const run of ordered.slice(0, runs.size - MAX_RUNS)) {
		run.controller.abort();
		runs.delete(run.id);
	}
}

export function createRun(sessionId: string, userId: string | null): Run {
	sweep();
	const run: Run = {
		id: randomUUID(),
		sessionId,
		userId,
		status: 'running',
		startedAt: new Date().toISOString(),
		events: [],
		controller: new AbortController(),
		listeners: new Set()
	};
	runs.set(run.id, run);
	return run;
}

/**
 * Write an event down and hand it to whoever is watching.
 *
 * The log is what makes this survivable, so it is written first and always:
 * a listener that throws must not cost the run its own memory of what happened.
 */
export function emitTo(run: Run, event: RunEvent): void {
	const sequenced: SequencedRunEvent = { id: run.events.length + 1, event };
	run.events.push(sequenced);

	if (event.type === 'done') finish(run, 'done');
	else if (event.type === 'error') finish(run, event.aborted ? 'aborted' : 'error');

	for (const listener of run.listeners) {
		try {
			listener(sequenced);
		} catch {
			// A listener that has gone away is not the run's problem.
		}
	}
}

function finish(run: Run, status: RunStatus): void {
	run.status = status;
	run.finishedAt = Date.now();
}

export function getRun(id: string, userId: string | null): Run | undefined {
	const run = runs.get(id);
	if (!run) return undefined;
	// Ownership is checked here rather than in each route, because forgetting it
	// in one route is all it takes to hand someone else's conversation over.
	if (run.userId !== userId) return undefined;
	return run;
}

/** The run still going for a conversation, which is what a reloading tab asks for. */
export function findRunForSession(sessionId: string, userId: string | null): Run | undefined {
	for (const run of runs.values()) {
		if (run.sessionId !== sessionId || run.userId !== userId) continue;
		if (!run.finishedAt || Date.now() - run.finishedAt < RETAIN_MS) return run;
	}
	return undefined;
}

export function cancelRun(run: Run): void {
	if (run.status !== 'running') return;
	run.controller.abort();
}

/**
 * Watch a run from a given point in its log.
 *
 * Everything already recorded after `fromId` is handed over first, then the
 * live ones. Deliberately not deduplicated against what the caller may already
 * have: the sequence number is the contract, and a caller that asks for the
 * whole log gets the whole log.
 */
export function subscribe(
	run: Run,
	fromId: number,
	listener: (event: SequencedRunEvent) => void
): () => void {
	for (const event of run.events) {
		if (event.id > fromId) listener(event);
	}
	if (run.finishedAt) return () => {};

	run.listeners.add(listener);
	return () => run.listeners.delete(listener);
}

export function summarise(run: Run): RunSummary {
	return {
		id: run.id,
		sessionId: run.sessionId,
		status: run.status,
		startedAt: run.startedAt,
		lastEventId: run.events.length
	};
}

export type { Run };
