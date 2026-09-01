import { getConfig } from '$lib/server/db/config';
import { getServer, getSharedModels, type ServerRow } from '$lib/server/db/servers';

/**
 * What an admin decided, applied where it cannot be bypassed.
 *
 * Sharing a subset of a system server's models and locking a system prompt both
 * used to live in the interface, so anyone with a console could ask for a model
 * that was never shared. These checks run in the proxy, on the only path a
 * request can take.
 */

/** Request bodies we understand well enough to police. */
export interface ChatBody {
	model?: unknown;
	messages?: unknown;
	[key: string]: unknown;
}

/**
 * Chat on every endpoint shape the app talks to, plus the image endpoints,
 * which were missing. The image tail is matched loosely because its prefix
 * varies: OpenAI serves it under `/v1`, Infomaniak under another API version.
 */
function isPolicedPath(path: string): boolean {
	return (
		/(^|\/)(chat\/completions|api\/chat|api\/generate|responses)$/.test(path) ||
		/images\/(generations(\/[a-z_]+)?|edits|variations)$/.test(path)
	);
}

export class PolicyError extends Error {
	constructor(
		readonly status: number,
		message: string
	) {
		super(message);
	}
}

/**
 * Whether this account may ask this connection for this model.
 *
 * The instance's shared list, with two exemptions: an admin set the list, and a
 * connection somebody owns is their own business. An empty list denies
 * everything on purpose, since a server with nothing shared is one this account
 * was never given anything to call.
 *
 * One function, because it is one question. It used to be asked in the words of
 * whatever was asking, and not at all in transcription and reading aloud.
 */
export function isModelShared(server: ServerRow, isAdmin: boolean, model: string): boolean {
	if (isAdmin || server.owner_user_id !== null) return true;
	return getSharedModels(server.id).includes(model);
}

/**
 * The connection an account may reach, or a refusal saying why: does it exist,
 * is it this account's, is it switched on. A system connection belongs to the
 * instance, a personal one to exactly one account.
 *
 * Here rather than in `api.ts` because a request is no longer the only thing
 * that asks: a voice socket asks at the door and on every call, with no response
 * to throw an HTTP error into. Each caller dresses the refusal in its own terms.
 */
export function reachableServer(userId: string, serverId: unknown): ServerRow {
	if (typeof serverId !== 'string' || !serverId) throw new PolicyError(400, 'serverId is required');

	const server = getServer(serverId);
	if (!server) throw new PolicyError(404, 'Server not found');
	if (server.owner_user_id !== null && server.owner_user_id !== userId) {
		throw new PolicyError(403, 'Forbidden');
	}
	if (!server.is_enabled) throw new PolicyError(403, 'Server is disabled');

	return server;
}

/**
 * Vets, and where needed rewrites, a request bound for a system server. Returns
 * the body to forward, or the original string when there is nothing to enforce.
 *
 * Chat and drawing alike: "is this model shared" is the same question whatever
 * the model produces. The locked instruction only lands where there are messages
 * to put it in front of.
 */
export function applyChatPolicy(
	server: ServerRow,
	isAdmin: boolean,
	path: string,
	body: string | undefined
): string | undefined {
	if (!body || !isPolicedPath(path)) return body;

	let parsed: ChatBody;
	try {
		parsed = JSON.parse(body);
	} catch {
		// Not JSON we understand: forward untouched rather than break a request shape
		// we did not anticipate.
		return body;
	}

	const vetted = policeChatBody(server, isAdmin, parsed);
	return vetted === parsed ? body : JSON.stringify(vetted);
}

/** Split out from the proxy's string handling because the proxy is no longer the only path: a turn running in this process addresses the provider itself. One implementation, two callers. */
export function policeChatBody<T extends ChatBody>(
	server: ServerRow,
	isAdmin: boolean,
	parsed: T
): T {
	// Only system servers carry admin policy, and admins set these rules.
	if (isAdmin || server.owner_user_id !== null) return parsed;

	// --- The model has to be one the admin actually shared ---------------------
	if (typeof parsed.model === 'string' && !isModelShared(server, isAdmin, parsed.model)) {
		throw new PolicyError(403, `Model "${parsed.model}" is not shared on this server`);
	}

	// --- A locked instruction always applies, where there is anywhere to put it --
	// Guaranteed present, not exclusive: the client legitimately sends system
	// messages of its own. Prepending is what makes it impossible to drop, from
	// under a persona included.
	if (getConfig('systemPromptsSharing') !== 'locked') return parsed;

	const locked = (getConfig('systemPromptsGlobal') ?? '').trim();
	if (!locked || !Array.isArray(parsed.messages)) return parsed;

	const already = parsed.messages.some(
		(m) =>
			typeof m === 'object' &&
			m !== null &&
			(m as { role?: string }).role === 'system' &&
			(m as { content?: string }).content === locked
	);
	if (already) return parsed;

	return { ...parsed, messages: [{ role: 'system', content: locked }, ...parsed.messages] };
}
