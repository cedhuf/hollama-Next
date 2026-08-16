import { error, json } from '@sveltejs/kit';

import { env as publicEnv } from '$env/dynamic/public';
import { runSpeakers } from '$lib/chat/run/speakers';
import type { RunInput } from '$lib/chat/run/types';
import { requireUser } from '$lib/server/api';
import { PolicyError } from '$lib/server/llmPolicy';
import { serverDeps, type RunPrincipal } from '$lib/server/runDeps';
import { createRun, emitTo, findRunForSession, summarise } from '$lib/server/runs';

/**
 * Start a turn, and answer immediately with the run it became.
 *
 * The request does not wait for the answer, on purpose: the point of running a
 * turn here is that it no longer belongs to whoever asked for it. The client
 * takes the id and opens the event stream, and if it never comes back the turn
 * finishes anyway.
 */
export async function POST(event) {
	const principal = await principalFor(event);
	const input = (await event.request.json().catch(() => null)) as RunInput | null;
	if (!input?.sessionId || !input.model) throw error(400, 'Expected a run to start');

	// One at a time per conversation. Two turns writing into the same transcript
	// is not a race the transcript can win, and a second tab hitting send is the
	// ordinary way it would happen.
	const existing = findRunForSession(input.sessionId, principal.userId);
	if (existing?.status === 'running') return json(summarise(existing), { status: 409 });

	// Resolved once here so a policy refusal is a 4xx on the request that caused it
	// rather than an error event on a run that should never have started. The
	// per-pass resolution below is the same call, for the speakers that follow.
	try {
		serverDeps(input, principal);
	} catch (e) {
		if (e instanceof PolicyError) throw error(e.status, e.message);
		throw e;
	}

	const run = createRun(input.sessionId, principal.userId);

	// Deliberately not awaited: this is the handover. Failures inside become
	// `error` events on the run, which is where a client will look for them.
	void runSpeakers(
		input,
		(pass) => serverDeps(pass, principal),
		(ev) => emitTo(run, ev),
		run.controller.signal
	);

	return json(summarise(run), { status: 201 });
}

/** The run still going for a conversation, which is what a reloading tab asks for. */
export async function GET(event) {
	const principal = await principalFor(event);
	const sessionId = event.url.searchParams.get('sessionId');
	if (!sessionId) throw error(400, 'Expected a sessionId');

	const run = findRunForSession(sessionId, principal.userId);
	return json(run ? summarise(run) : null);
}

/**
 * Who is asking.
 *
 * Server mode has accounts and every run belongs to one. Local mode has none,
 * and the instance is the user's own machine: everything belongs to the same
 * nobody, which is the honest description of a single-user deployment.
 */
async function principalFor(event: Parameters<typeof requireUser>[0]): Promise<RunPrincipal> {
	if (publicEnv.PUBLIC_MODE !== 'server') return { userId: null, isAdmin: true };
	const user = await requireUser(event);
	return { userId: user.id, isAdmin: user.role === 'admin' };
}
