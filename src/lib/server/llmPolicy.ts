import { getConfig } from '$lib/server/db/config';
import { getSharedModels, type ServerRow } from '$lib/server/db/servers';

/**
 * What an admin decided, applied where it can't be bypassed.
 *
 * The Admin tab has always been able to share a subset of a system server's
 * models and to lock a global system prompt, but both lived in the interface:
 * the browser chose the model and assembled the messages, so anyone willing to
 * open a console could ask a system server for a model that was never shared,
 * or drop the instance's prompt. These checks run in the proxy, on the only path
 * a request can take.
 */

/** Request bodies we understand well enough to police. */
export interface ChatBody {
	model?: unknown;
	messages?: unknown;
	[key: string]: unknown;
}

/**
 * The paths an admin's rules apply to.
 *
 * Chat, on every endpoint shape the app can talk to, plus the image endpoints —
 * which were missing, and which is how a model nobody ever shared could be
 * reached by anyone willing to type the request by hand. The image tail is
 * matched loosely because its prefix varies by provider: OpenAI serves it under
 * `/v1`, Infomaniak under a different API version with no `/v1` at all.
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
 * Vets — and where needed rewrites — a request bound for a system server.
 *
 * Returns the body to forward, or the original string when there is nothing to
 * enforce. Admins are exempt: they set these rules, and a server they own is
 * their own business.
 *
 * Chat and drawing alike. The model check applies to both, because "is this
 * model shared" is the same question whatever the model produces. The locked
 * instruction only lands where there are messages to put it in front of, which
 * an image request has none of.
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
		// Not JSON we understand: forward untouched rather than break a request
		// shape we didn't anticipate.
		return body;
	}

	const vetted = policeChatBody(server, isAdmin, parsed);
	return vetted === parsed ? body : JSON.stringify(vetted);
}

/**
 * The rules themselves, over a parsed request.
 *
 * Split out from the proxy's string handling because the proxy is no longer the
 * only path a request can take: a turn running in this process addresses the
 * provider itself, and an admin's rules that only lived in the proxy would be
 * rules a server-side run quietly dropped. One implementation, two callers.
 */
export function policeChatBody<T extends ChatBody>(
	server: ServerRow,
	isAdmin: boolean,
	parsed: T
): T {
	// Only system servers carry admin policy; a user's own connection is theirs.
	// Admins are exempt: they set these rules.
	if (isAdmin || server.owner_user_id !== null) return parsed;

	// --- The model has to be one the admin actually shared ---------------------
	// An empty list denies everything, deliberately: `/api/providers` already
	// offers a non-admin exactly the shared models, so a server with none shared
	// is a server they were never given anything to call.
	const shared = getSharedModels(server.id);
	if (typeof parsed.model === 'string' && !shared.includes(parsed.model)) {
		throw new PolicyError(403, `Model "${parsed.model}" is not shared on this server`);
	}

	// --- A locked instruction always applies, where there is anywhere to put it --
	// Only guaranteed *present*, not exclusive: the client legitimately sends
	// system messages of its own (search results, fetched pages, the persona,
	// the date). Prepending is what makes a protective instruction impossible to
	// drop — including from under a persona, which is the case that motivated it.
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
