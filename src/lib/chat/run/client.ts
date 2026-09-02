import type { RunEvent, RunInput, RunSummary } from './types';

/** Three verbs and no state: start one, follow one, stop one. What the events mean is the reducer's business, and where they came from is nobody's. */

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

/** Best effort by design: the question may already have been answered in another tab, and the turn carries on either way. What the page does comes from the run's own `approvalResolved` event. */
export async function decideApproval(runId: string, callId: string, allow: boolean): Promise<void> {
	await fetch(`/api/runs/${runId}/approve`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ callId, allow })
	}).catch(() => {
		// A run that cannot be reached has ended, and an unanswered question is a
		// refused one.
	});
}

export async function cancelRun(runId: string): Promise<void> {
	await fetch(`/api/runs/${runId}/cancel`, { method: 'POST' }).catch(() => {
		// A run that cannot be reached is already over as far as this page is concerned.
	});
}

export interface FollowOptions {
	/** Everything up to and including it is history and is handed over marked as such. The number comes from the run's own summary, so the boundary is the server's. */
	replayThrough?: number;
	/** Called once the backlog has been delivered, and only if there was one. */
	onCaughtUp?: () => void;
}

/** Resolves when the turn is over, whichever way, so a caller awaits it exactly as it awaited the local one. `from` is where to resume; zero replays the whole log. */
export function followRun(
	runId: string,
	from: number,
	onEvent: (event: RunEvent, replay: boolean) => void,
	{ replayThrough = 0, onCaughtUp }: FollowOptions = {}
): { done: Promise<void>; stop: () => void } {
	const source = new EventSource(`/api/runs/${runId}/events?from=${from}`);
	let settle: () => void = () => {};
	const done = new Promise<void>((resolve) => (settle = resolve));

	const close = () => {
		source.close();
		settle();
	};

	let caughtUp = replayThrough === 0;

	source.onmessage = (message) => {
		let event: RunEvent;
		try {
			event = JSON.parse(message.data) as RunEvent;
		} catch {
			return;
		}

		const id = Number(message.lastEventId) || 0;
		const replay = !caughtUp && id <= replayThrough;
		onEvent(event, replay);

		if (replay && id >= replayThrough) {
			caughtUp = true;
			onCaughtUp?.();
		}

		if (event.type === 'done' || event.type === 'error') close();
	};

	source.onerror = () => {
		// EventSource reconnects on its own carrying `Last-Event-ID`, so a dropped
		// connection is not an ending. Only a closed one is.
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
