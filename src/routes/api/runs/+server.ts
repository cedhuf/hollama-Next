import { error, json } from '@sveltejs/kit';

import { runSpeakers } from '$lib/chat/run/speakers';
import type { RunInput } from '$lib/chat/run/types';
import { MCP_LIMITS, type McpApprovalRequest } from '$lib/mcp';
import { requireUser } from '$lib/server/api';
import { resolveClaimedAppPrompts } from '$lib/server/appPromptsResolver';
import { getItem } from '$lib/server/db/collections';
import { PolicyError } from '$lib/server/llmPolicy';
import { serverDeps, type RunPrincipal } from '$lib/server/runDeps';
import { awaitApproval, createRun, emitTo, findRunForSession, summarise } from '$lib/server/runs';
import { sessionWriter } from '$lib/server/runSession';
import { recordRunUsage } from '$lib/server/usageMeter';

/** The request does not wait for the answer, on purpose: the turn no longer belongs to whoever asked for it. The client takes the id and opens the stream; if it never comes back the turn finishes anyway. */
export async function POST(event) {
	const principal = await principalFor(event);
	const input = (await event.request.json().catch(() => null)) as RunInput | null;
	if (!input?.sessionId || !input.model) throw error(400, 'Expected a run to start');

	// The instance's answer about who may rewrite which instruction, applied to what
	// the request claims. Here because this is where the client's word arrives, and
	// a rule enforced past that point is one somebody reaches around via the API.
	input.promptOverrides = resolveClaimedAppPrompts(
		input.promptOverrides,
		principal.isAdmin
	).overrides;

	// The question has to exist before the answer does. The page saves the message
	// before handing the turn over, so a missing conversation is a client that
	// skipped that step, and starting anyway produces an answer with nowhere to go.
	if (!getItem('sessions', principal.userId, input.sessionId)) {
		throw error(404, 'No such conversation');
	}

	// One at a time per conversation: two turns writing into the same transcript is
	// not a race the transcript can win, and a second tab hitting send is the
	// ordinary way it happens.
	const existing = findRunForSession(input.sessionId, principal.userId);
	if (existing?.status === 'running') return json(summarise(existing), { status: 409 });

	// Resolved once here, so a policy refusal is a 4xx on the request that caused it
	// rather than an error event on a run that should never have started.
	try {
		serverDeps(input, principal);
	} catch (e) {
		if (e instanceof PolicyError) throw error(e.status, e.message);
		throw e;
	}

	const run = createRun(input.sessionId, principal.userId);

	// What the turn produces is written down as it is produced, and only then handed
	// to whoever is watching. That order is the point: a client that reads a message
	// and reloads on the spot finds it stored.
	const write = sessionWriter(principal.userId, input.sessionId);

	// Deliberately not awaited: this is the handover, and failures inside become
	// `error` events on the run.
	//
	// The approval comes back on `/api/runs/{id}/approve`, bound to this run because
	// that is the name both sides have: the tab that started it may be gone, and any
	// tab of this account's may answer.
	const approve = (request: McpApprovalRequest) =>
		awaitApproval(run, request.id, MCP_LIMITS.approvalTimeoutMs);

	void runSpeakers(
		input,
		(pass) => serverDeps(pass, principal, { approve }),
		(ev) => {
			// Counted here, where the turn actually happens. The relay in `/api/llm` meters
			// what the browser sends through it, and in server mode the browser sends
			// nothing: `runDeps` talks to the provider itself, so every server-side turn
			// went uncounted while the meter watched a road nobody was on.
			//
			// The counts come from the run's own `usage` event, which both strategies fill
			// from what the provider reported.
			if (ev.type === 'usage' && principal.userId) {
				recordRunUsage(principal.userId, ev.serverId, ev.model, ev.used);
			}
			write(ev);
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
