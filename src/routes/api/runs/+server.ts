import { error, json } from '@sveltejs/kit';

import { runSpeakers } from '$lib/chat/run/speakers';
import type { RunInput } from '$lib/chat/run/types';
import { requireUser } from '$lib/server/api';
import { resolveClaimedAppPrompts } from '$lib/server/appPromptsResolver';
import { PolicyError } from '$lib/server/llmPolicy';
import { serverDeps, type RunPrincipal } from '$lib/server/runDeps';
import { createRun, emitTo, findRunForSession, summarise } from '$lib/server/runs';
import { recordRunUsage } from '$lib/server/usageMeter';

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

	// The instance's answer about who may rewrite which instruction, applied to
	// what the request claims. Here rather than deeper down because this is where
	// the client's word arrives, and a rule enforced past that point is a rule
	// somebody can reach around by calling the API directly.
	input.promptOverrides = resolveClaimedAppPrompts(
		input.promptOverrides,
		principal.isAdmin
	).overrides;

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
		(ev) => {
			// Counted here, where the turn actually happens.
			//
			// The relay in `/api/llm` meters what the browser sends through it, and in
			// server mode the browser sends nothing through it: `runDeps` builds a
			// direct strategy and talks to the provider itself. So every server-side
			// turn went uncounted while the meter watched a road nobody was on.
			//
			// The counts come from the run's own `usage` event, which both strategies
			// fill from what the provider reported, so this path and the browser's
			// agree by construction.
			if (ev.type === 'usage' && principal.userId) {
				recordRunUsage(principal.userId, ev.serverId, ev.model, ev.used);
			}
			emitTo(run, ev);
		},
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

/** Who is asking. Every run belongs to an account, even the implicit one. */
async function principalFor(event: Parameters<typeof requireUser>[0]): Promise<RunPrincipal> {
	const user = await requireUser(event);
	return { userId: user.id, isAdmin: user.role === 'admin' };
}
