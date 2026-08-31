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
	/** The account this run belongs to. */
	userId: string | null;
	status: RunStatus;
	startedAt: string;
	finishedAt?: number;
	events: SequencedRunEvent[];
	controller: AbortController;
	listeners: Set<(event: SequencedRunEvent) => void>;
	/**
	 * MCP calls this run is stopped on, by call id.
	 *
	 * Held here rather than in the turn because the answer arrives on a different
	 * request, from a tab that may not be the one that started it. The run is what
	 * both sides can name.
	 */
	pending: Map<string, (allowed: boolean) => void>;
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
		listeners: new Set(),
		pending: new Map()
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
	// A run that has ended cannot make the call it was asking about, so every
	// question still standing is answered no. Silence is never consent here, and
	// a promise nobody will ever settle is a turn that never returns.
	for (const settle of run.pending.values()) settle(false);
	run.pending.clear();
}

/**
 * Wait for a person to allow or refuse one call.
 *
 * Returns false when the wait runs out, when the run is cancelled, and when
 * anybody says no. The only way to true is somebody saying yes.
 */
export function awaitApproval(run: Run, callId: string, timeoutMs: number): Promise<boolean> {
	return new Promise((resolve) => {
		let settled = false;
		const settle = (allowed: boolean) => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			run.pending.delete(callId);
			resolve(allowed);
		};

		const timer = setTimeout(() => {
			if (run.pending.has(callId)) {
				emitTo(run, { type: 'approvalResolved', id: callId, allowed: false, by: 'timeout' });
			}
			settle(false);
		}, timeoutMs);

		run.pending.set(callId, settle);
	});
}

/**
 * Answer one of those questions. True when there was one to answer.
 *
 * Records the answer as an event before settling, so every client watching the
 * run stops asking, including the ones that never sent anything.
 */
export function decideApproval(run: Run, callId: string, allowed: boolean): boolean {
	const settle = run.pending.get(callId);
	if (!settle) return false;
	emitTo(run, { type: 'approvalResolved', id: callId, allowed, by: 'user' });
	settle(allowed);
	return true;
}

export function getRun(id: string, userId: string | null): Run | undefined {
	const run = runs.get(id);
	if (!run) return undefined;
	// Ownership is checked here rather than in each route, because forgetting it
	// in one route is all it takes to hand someone else's conversation over.
	if (run.userId !== userId) return undefined;
	return run;
}

/**
 * The conversation's most recent run, which is what a reloading tab asks for.
 *
 * The most recent, and it used to be whichever came out of the map first, which
 * is the oldest one still held. So a conversation answered twice inside the
 * retention window handed a returning tab the turn before last: it replayed a
 * finished run, saw its ending, and sat there looking idle while the real one was
 * still being written a few metres away.
 *
 * A turn still going wins over a finished one whatever their order, since that is
 * the one there is anything left to watch.
 */
export function findRunForSession(sessionId: string, userId: string | null): Run | undefined {
	let best: Run | undefined;
	for (const run of runs.values()) {
		if (run.sessionId !== sessionId || run.userId !== userId) continue;
		if (run.finishedAt && Date.now() - run.finishedAt >= RETAIN_MS) continue;
		if (!best) best = run;
		else if (!run.finishedAt && best.finishedAt) best = run;
		else if (!run.finishedAt === !best.finishedAt && run.startedAt > best.startedAt) best = run;
	}
	return best;
}

export function cancelRun(run: Run): void {
	if (run.status !== 'running') return;
	// Said before the abort lands, so a client that is looking at the question
	// sees it withdrawn rather than left hanging until the error arrives.
	for (const callId of run.pending.keys()) {
		emitTo(run, { type: 'approvalResolved', id: callId, allowed: false, by: 'aborted' });
	}
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
