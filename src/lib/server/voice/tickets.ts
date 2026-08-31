import { randomUUID } from 'node:crypto';

import type { VoiceConfig } from './config';

/**
 * Proof, handed over once, that this socket may hold this conversation.
 *
 * A WebSocket upgrade never passes through SvelteKit's `handle`, so
 * `locals.auth()` does not exist on it and `sessionUser` cannot be called. The
 * alternatives were both bad: decode the Auth.js cookie by hand, which welds us
 * to their internals for as long as we both live, or trust whatever the socket
 * claims about itself, which is not a scheme.
 *
 * So the browser asks an ordinary authenticated route first. That route knows
 * who is knocking because every other route does, it settles which connections
 * and models the conversation may reach, and it leaves the answer here under a
 * name nobody can guess. The socket then presents the name and gets the answer.
 *
 * Thirty seconds and one use. It is handed straight from a fetch to a socket
 * opened in the same breath, so a minute would be generous; and having spent it,
 * it is gone, which is what stops a ticket read out of a log from being a second
 * way in.
 *
 * In memory on purpose, like `runs`. A restart loses tickets that were in flight,
 * which costs somebody one press of a button, and a second replica behind a load
 * balancer would need the socket to land on the process that issued the ticket.
 * Both are real limits and both are fixed the same way on the day llooma runs at
 * that scale; paying for it now would buy nothing.
 */

/** Long enough to open a socket, short enough not to be worth stealing. */
const TTL_MS = 30_000;

/** A ceiling, so a client that asks in a loop cannot take the process with it. */
const MAX_TICKETS = 200;

export interface VoiceGrant {
	userId: string;
	isAdmin: boolean;
	/** The conversation to continue, or null to make one on the first question. */
	sessionId: string | null;
	config: VoiceConfig;
}

interface Ticket extends VoiceGrant {
	expiresAt: number;
}

const tickets = new Map<string, Ticket>();

/** Drop what has expired, and then the oldest if there are still too many. */
function sweep(): void {
	const now = Date.now();
	for (const [id, ticket] of tickets) if (ticket.expiresAt <= now) tickets.delete(id);

	if (tickets.size <= MAX_TICKETS) return;
	const ordered = [...tickets.entries()].sort((a, b) => a[1].expiresAt - b[1].expiresAt);
	for (const [id] of ordered.slice(0, tickets.size - MAX_TICKETS)) tickets.delete(id);
}

/** Write down what a socket will be allowed to do, and return the name for it. */
export function issueTicket(grant: VoiceGrant): { ticket: string; expiresIn: number } {
	sweep();
	const ticket = randomUUID();
	tickets.set(ticket, { ...grant, expiresAt: Date.now() + TTL_MS });
	return { ticket, expiresIn: TTL_MS };
}

/**
 * Read a ticket, and spend it.
 *
 * Deleted whether or not it was still valid: a name that has been presented once
 * is finished either way, and leaving an expired one in the map only gives the
 * sweep something to do later.
 */
export function claimTicket(ticket: unknown): VoiceGrant | null {
	if (typeof ticket !== 'string' || !ticket) return null;

	const found = tickets.get(ticket);
	tickets.delete(ticket);
	if (!found || found.expiresAt <= Date.now()) return null;

	return {
		userId: found.userId,
		isAdmin: found.isAdmin,
		sessionId: found.sessionId,
		config: found.config
	};
}
