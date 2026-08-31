import { error, json } from '@sveltejs/kit';

import { requireServer, requireUser } from '$lib/server/api';
import { resolveVoiceConfig } from '$lib/server/voice/config';
import { ensureVoiceSocket } from '$lib/server/voice/socket';
import { issueTicket } from '$lib/server/voice/tickets';

/**
 * The door to a spoken conversation, opened before the socket is.
 *
 * Everything a voice session is allowed to do is decided here, in an ordinary
 * authenticated route, where `requireUser` and `requireServer` work exactly as
 * they do everywhere else in the app. What the socket receives afterwards is a
 * decision, not a request: it never resolves a model, never reads a setting and
 * never has an opinion about who its user is.
 *
 * The refusal is as important as the grant. A screen whose entire purpose is a
 * spoken exchange should say what is missing before the exchange rather than
 * during it, so an account with no transcription model gets a list of what to go
 * and set up, not a socket that opens and then fails to hear anything.
 */
export async function POST(event) {
	const user = await requireUser(event);

	// Before anything is promised. Attaching is idempotent, and doing it here is
	// what makes the ordering provable rather than likely: a socket can only be
	// opened by somebody holding a ticket, and this is the only place one comes
	// from, so the listener always exists before the first upgrade arrives.
	if (!(await ensureVoiceSocket())) {
		throw error(503, 'This instance cannot accept a voice connection');
	}

	const body = await event.request.json().catch(() => null);
	const asked = (body ?? {}).sessionId;
	if (asked !== undefined && asked !== null && typeof asked !== 'string') {
		throw error(400, 'sessionId must be a string when given');
	}
	const sessionId = typeof asked === 'string' && asked ? asked : null;

	const resolved = resolveVoiceConfig(user, sessionId);
	if (!resolved.ok) {
		// Answered rather than thrown, because the list is the answer. `error()`
		// carries a sentence, so a structured refusal has to be encoded into one and
		// decoded on the other side, and a body that is JSON inside JSON is a body
		// somebody will eventually parse twice or once.
		//
		// 409 rather than 400: nothing is wrong with the request. The account is not
		// set up to answer it, which is a different thing and a fixable one.
		return json({ ok: false, missing: resolved.missing }, { status: 409 });
	}

	const { config } = resolved;

	// The same three questions every other route asks of a connection, asked once
	// here for all three of them, because after this there is no request left to
	// ask them on. A connection deleted or switched off between two conversations
	// is refused at the door rather than halfway through a sentence.
	requireServer(user.id, config.listen.serverId);
	requireServer(user.id, config.speak.serverId);
	requireServer(user.id, config.think.serverId);

	const { ticket, expiresIn } = issueTicket({
		userId: user.id,
		isAdmin: user.role === 'admin',
		sessionId,
		config
	});

	return json({ ok: true, ticket, expiresIn }, { headers: { 'cache-control': 'no-store' } });
}
