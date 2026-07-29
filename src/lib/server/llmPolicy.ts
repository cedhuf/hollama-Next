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
interface ChatBody {
	model?: unknown;
	messages?: unknown;
	[key: string]: unknown;
}

/** Ollama and OpenAI-compatible chat endpoints alike. */
function isChatPath(path: string): boolean {
	return /(^|\/)(chat\/completions|api\/chat|api\/generate|responses)$/.test(path);
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
 * Vets — and where needed rewrites — a chat request bound for a system server.
 *
 * Returns the body to forward, or the original string when there is nothing to
 * enforce. Admins are exempt: they set these rules, and a server they own is
 * their own business.
 */
export function applyChatPolicy(
	server: ServerRow,
	isAdmin: boolean,
	path: string,
	body: string | undefined
): string | undefined {
	// Only system servers carry admin policy; a user's own connection is theirs.
	if (isAdmin || !body || server.owner_user_id !== null || !isChatPath(path)) return body;

	let parsed: ChatBody;
	try {
		parsed = JSON.parse(body);
	} catch {
		// Not JSON we understand: forward untouched rather than break a request
		// shape we didn't anticipate.
		return body;
	}

	// --- The model has to be one the admin actually shared ---------------------
	// An empty list denies everything, deliberately: `/api/providers` already
	// offers a non-admin exactly the shared models, so a server with none shared
	// is a server they were never given anything to call.
	const shared = getSharedModels(server.id);
	if (typeof parsed.model === 'string' && !shared.includes(parsed.model)) {
		throw new PolicyError(403, `Model "${parsed.model}" is not shared on this server`);
	}

	// --- A locked instruction always applies -----------------------------------
	// Only guaranteed *present*, not exclusive: the client legitimately sends
	// system messages of its own (search results, fetched pages, the persona,
	// the date). Prepending is what makes a protective instruction impossible to
	// drop — including from under a persona, which is the case that motivated it.
	if (getConfig('systemPromptsSharing') === 'locked') {
		const locked = (getConfig('systemPromptsGlobal') ?? '').trim();
		if (locked && Array.isArray(parsed.messages)) {
			const already = parsed.messages.some(
				(m) =>
					typeof m === 'object' &&
					m !== null &&
					(m as { role?: string }).role === 'system' &&
					(m as { content?: string }).content === locked
			);
			if (!already) parsed.messages = [{ role: 'system', content: locked }, ...parsed.messages];
		}
	}

	return JSON.stringify(parsed);
}
