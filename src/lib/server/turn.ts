import { env as publicEnv } from '$env/dynamic/public';
import { runTurn } from '$lib/chat/run/orchestrator';
import type { RunEvent, RunInput } from '$lib/chat/run/types';
import type { BotTool } from '$lib/integrations';
import type { Message } from '$lib/sessions';
import { effectiveSystemPrompt } from '$lib/settings';

import { resolveAppPrompts } from './appPromptsResolver';
import { getSettings } from './db/collections';
import { getUserById } from './db/users';
import { PolicyError } from './llmPolicy';
import { serverDeps, type RunPrincipal } from './runDeps';
import { resolveSearch } from './searchResolver';
import { resolveSystemPrompts } from './systemPromptsResolver';
import { resolveTools } from './toolsResolver';
import { recordRunUsage } from './usageMeter';

/**
 * One question, one answer, nothing kept.
 *
 * `/api/runs` is the other way to run a turn and the right one for a
 * conversation: it registers the run and writes what comes out. A bot on another
 * chat server has neither, so this returns the text and skips both.
 *
 * Everything else is shared: the same orchestrator and `serverDeps`, so the
 * instance's policy applies as it does to a person typing.
 */
export interface TurnRequest {
	/** The account this runs as. Its connections, its settings, its policy. */
	userId: string;
	/** The connection serving the model, by id. The server resolves address and key. */
	serverId: string;
	model: string;
	/** Who the answer should sound like. Empty means no instructions at all. */
	systemPrompt?: string;
	/** The conversation as the model should receive it, already assembled. */
	messages: Message[];
	/** Asked for rather than assumed, and granted only where the instance offers it: a bot promised web search on an instance with no search endpoint is worse off than one that knows it cannot. */
	tools?: BotTool[];
	signal?: AbortSignal;
}

export interface TurnResult {
	text: string;
	/** What the provider reported, when it reported anything. */
	usage?: { input: number; output: number };
}

/** Here rather than at the caller, because it is the same answer the page computes for a new conversation: a bot asking for "the usual" should get exactly that. */
export function defaultSystemPrompt(userId: string, model: string): string {
	const user = getUserById(userId);
	if (!user) return '';
	const { prompts } = resolveSystemPrompts(getSettings(userId), user.role === 'admin');
	return effectiveSystemPrompt(model, prompts);
}

/** Whether a search would go anywhere, which is what the flag is worth promising. */
function searchAvailable(userId: string, isAdmin: boolean): boolean {
	if (publicEnv.PUBLIC_SEARCH_URL?.trim()) return true;
	return !!resolveSearch(getSettings(userId), isAdmin).url;
}

export async function runTurnOnce(request: TurnRequest): Promise<TurnResult> {
	const user = getUserById(request.userId);
	if (!user) throw new PolicyError(404, 'No such account');

	const principal: RunPrincipal = { userId: user.id, isAdmin: user.role === 'admin' };
	const wanted = new Set(request.tools ?? []);
	const canSearch = wanted.has('webSearch') && searchAvailable(user.id, principal.isAdmin);
	const canFetch =
		wanted.has('webFetch') && resolveTools(getSettings(user.id), principal.isAdmin).webFetch;

	const input: RunInput = {
		// Nothing registers this run and nothing stores it, so there is no conversation
		// for it to belong to. Named rather than left undefined, since the field is
		// required and an empty id is clearer than a made-up one in a log.
		sessionId: '',
		serverId: request.serverId,
		model: request.model,
		think: wanted.has('thinking'),
		systemPrompt: request.systemPrompt?.trim() || undefined,
		messages: request.messages,
		flags: {
			webSearch: canSearch,
			webFetch: canFetch,
			// No client is watching, so a question asked as a choice would arrive in the
			// room as an unanswerable list.
			interactiveChoices: false,
			sendCurrentDate: wanted.has('sendCurrentDate'),
			nativeTools: getSettings(user.id)?.nativeTools ?? 'auto',
			webSearchAuto: canSearch,
			mcp: wanted.has('mcp')
		},
		capabilities: { search: canSearch, fetch: canFetch },
		// The account's own rewrites, resolved by the instance rather than claimed by
		// the caller: this path has no client to claim anything.
		promptOverrides: resolveAppPrompts(getSettings(user.id), principal.isAdmin).overrides
	};

	// Resolved before anything starts, so a refused model is an error the caller can
	// report rather than an empty answer.
	//
	// MCP unattended if and only if the owner ticked it: there is no person to put a
	// call to here, so that box is the whole of the consent. See `DepsOptions`.
	const deps = serverDeps(input, principal, { mcpUnattended: wanted.has('mcp') });

	let text = '';
	let usage: TurnResult['usage'];
	let failure: string | null = null;

	const collect = (event: RunEvent): void => {
		// The finished message rather than the fragments: a turn can produce more than
		// one round, and only the messages are what a reader would have seen.
		if (event.type === 'message') text += (text ? '\n\n' : '') + event.message.content;
		else if (event.type === 'usage') {
			usage = event.used;
			// Counted here rather than by the caller, so a turn started from anywhere lands
			// in the same meter. The bot spends real money on somebody's account.
			recordRunUsage(
				user.id,
				event.serverId ?? request.serverId,
				event.model ?? request.model,
				event.used
			);
		} else if (event.type === 'error' && !event.aborted) failure = event.message;
	};

	const controller = new AbortController();
	const abort = () => controller.abort();
	request.signal?.addEventListener('abort', abort, { once: true });
	try {
		await runTurn(input, deps, collect, controller.signal);
	} finally {
		request.signal?.removeEventListener('abort', abort);
	}

	// A turn that failed halfway still emits what it had written. One that failed
	// with nothing is an error, said as one.
	if (failure && !text.trim()) throw new Error(failure);

	return { text: text.trim(), usage };
}
