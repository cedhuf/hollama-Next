import type { RunEvent, RunInput, RunSummary } from './types';

/**
 * Talking to a turn that is not in this page.
 *
 * Three verbs and no state: start one, follow one, stop one. What the events
 * mean is the reducer's business, and where they came from is nobody's, which is
 * what lets the page treat a run in the server exactly like a run in the tab.
 */

/** Where a conversation's run is remembered between page loads. */
const runKey = (sessionId: string) => `llooma-run-${sessionId}`;

export function rememberRun(sessionId: string, runId: string): void {
	try {
		localStorage.setItem(runKey(sessionId), runId);
	} catch {
		// Private browsing, or a full quota. The run still finishes; only coming
		// back to it after a reload is lost, which is no worse than before.
	}
}

export function forgetRun(sessionId: string): void {
	try {
		localStorage.removeItem(runKey(sessionId));
	} catch {
		// See above.
	}
}

export function rememberedRun(sessionId: string): string | null {
	try {
		return localStorage.getItem(runKey(sessionId));
	} catch {
		return null;
	}
}

/** Hand a turn over to the server. Returns as soon as it has an id, not an answer. */
export async function startRun(input: RunInput): Promise<RunSummary> {
	const response = await fetch('/api/runs', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(input)
	});

	// A conversation already generating: the server refuses the second turn and
	// hands back the one that is running, which is what the caller should follow.
	if (response.status === 409) return (await response.json()) as RunSummary;
	if (!response.ok) throw new Error(await errorText(response));
	return (await response.json()) as RunSummary;
}

/** The run still going for a conversation, if there is one. */
export async function runForSession(sessionId: string): Promise<RunSummary | null> {
	const response = await fetch(`/api/runs?sessionId=${encodeURIComponent(sessionId)}`);
	if (!response.ok) return null;
	return (await response.json()) as RunSummary | null;
}

export async function cancelRun(runId: string): Promise<void> {
	await fetch(`/api/runs/${runId}/cancel`, { method: 'POST' }).catch(() => {
		// A run that cannot be reached is a run that is already over as far as this
		// page is concerned. The stop button has done its job either way.
	});
}

/**
 * Follow a run until it ends.
 *
 * Resolves when the turn is over, whichever way it ended, so a caller can await
 * it exactly as it awaited the local one. `from` is where to resume: zero
 * replays the whole log, which is what a page that has just loaded wants.
 */
export function followRun(
	runId: string,
	from: number,
	onEvent: (event: RunEvent) => void
): { done: Promise<void>; stop: () => void } {
	const source = new EventSource(`/api/runs/${runId}/events?from=${from}`);
	let settle: () => void = () => {};
	const done = new Promise<void>((resolve) => (settle = resolve));

	const close = () => {
		source.close();
		settle();
	};

	source.onmessage = (message) => {
		let event: RunEvent;
		try {
			event = JSON.parse(message.data) as RunEvent;
		} catch {
			return;
		}
		onEvent(event);
		if (event.type === 'done' || event.type === 'error') close();
	};

	source.onerror = () => {
		// EventSource reconnects on its own, carrying `Last-Event-ID`, so a dropped
		// connection is not an ending. Only a closed one is: that is the server
		// having finished and hung up, or the run having gone.
		if (source.readyState === EventSource.CLOSED) close();
	};

	return { done, stop: close };
}

async function errorText(response: Response): Promise<string> {
	try {
		const body = await response.json();
		return typeof body?.message === 'string' ? body.message : `HTTP ${response.status}`;
	} catch {
		return `HTTP ${response.status}`;
	}
}
