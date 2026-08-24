import { error } from '@sveltejs/kit';

import type { SequencedRunEvent } from '$lib/chat/run/types';
import { requireUser } from '$lib/server/api';
import { getRun, subscribe } from '$lib/server/runs';

/**
 * Watch a run, from wherever the client left off.
 *
 * Server-sent events rather than a socket: the traffic only goes one way, it
 * survives any reverse proxy that can already carry a streamed response, and
 * resumption is part of the protocol rather than something we invent. A client
 * that reconnects sends `Last-Event-ID`, and gets exactly what it missed.
 *
 * A finished run still answers. Its whole log is replayed and the stream closes,
 * which is what makes a reload that lands after the model finished collect the
 * answer instead of finding an empty conversation.
 */
export async function GET(event) {
	const userId = (await requireUser(event)).id;

	const run = getRun(event.params.id, userId);
	if (!run) throw error(404, 'No such run');

	// The header is the browser's own resumption; the query parameter is for a
	// first connection that already knows where it stands, which is the case
	// after a reload that read the run's summary before subscribing.
	const header = Number(event.request.headers.get('last-event-id'));
	const asked = Number(event.url.searchParams.get('from'));
	const from = Math.max(Number.isFinite(header) ? header : 0, Number.isFinite(asked) ? asked : 0);

	let unsubscribe = () => {};

	const stream = new ReadableStream<Uint8Array>({
		start(controller) {
			const encoder = new TextEncoder();
			let closed = false;

			const close = () => {
				if (closed) return;
				closed = true;
				unsubscribe();
				try {
					controller.close();
				} catch {
					// Already closed by the client disconnecting.
				}
			};

			// One subscription does both jobs: `subscribe` replays what came before
			// the join and then feeds the live ones through the same listener, so
			// catching up and following are the same code path here as well.
			unsubscribe = subscribe(run, from, (sequenced: SequencedRunEvent) => {
				if (closed) return;
				try {
					controller.enqueue(
						encoder.encode(`id: ${sequenced.id}\ndata: ${JSON.stringify(sequenced.event)}\n\n`)
					);
				} catch {
					// The client went away mid-write. The run does not care.
					close();
					return;
				}
				// The last event a client needs is one of these two, and both come
				// through here, so the run's ending is what closes the stream rather
				// than a timer guessing at it.
				if (sequenced.event.type === 'done' || sequenced.event.type === 'error') close();
			});

			// A run that had already finished has just had its whole log replayed.
			if (run.status !== 'running') close();
		},

		cancel() {
			// The client navigated away or reloaded. Unhooking is all that happens:
			// the run keeps going, which is the entire reason it lives on the server.
			unsubscribe();
		}
	});

	return new Response(stream, {
		headers: {
			'content-type': 'text/event-stream',
			'cache-control': 'no-cache, no-transform',
			connection: 'keep-alive',
			// Nginx buffers streamed responses by default, which turns a live answer
			// into one that arrives all at once when it is already finished.
			'x-accel-buffering': 'no'
		}
	});
}
