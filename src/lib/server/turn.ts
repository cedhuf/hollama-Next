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
 * `/api/runs` is the other way to run a turn, and it is the right one for a
 * conversation: it registers the run so a reloading tab can find it, and it
 * writes what comes out into the stored transcript. Everything it does is about
 * a conversation that exists here and that somebody is watching.
 *
 * A bot on another chat server has neither. The transcript lives over there, no
 * browser is attached, and the answer's only destination is the message that
 * will carry it back. So this path skips the registry and the writer entirely
 * and returns the text, which is the whole of what the caller wanted.
 *
 * Everything else is shared, deliberately: the same orchestrator, the same
 * `serverDeps`, so the instance's model policy, its search configuration and its
 * page-reading limits apply here exactly as they apply to a person typing.
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
	/**
	 * What the turn may reach for.
	 *
	 * Asked for rather than assumed, and granted only where the instance actually
	 * offers it: a bot promised web search on an instance with no search endpoint
	 * would be told it can search and then find nothing, which is worse for a
	 * model than knowing it cannot.
	 */
	tools?: BotTool[];
	signal?: AbortSignal;
}

export interface TurnResult {
	text: string;
	/** What the provider reported, when it reported anything. */
	usage?: { input: number; output: number };
}

/**
 * The instructions a conversation would start with, for this account and model.
 *
 * Here rather than at the caller because it is the same answer the page
 * computes for a new conversation, and a bot asking for "the usual" should get
 * exactly that, per-model overrides included.
 */
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
		// Nothing registers this run and nothing stores it, so there is no
		// conversation for it to belong to. Named rather than left undefined
		// because the field is required, and because an empty id is a clearer
		// answer than a made-up one if it ever surfaces in a log.
		sessionId: '',
		serverId: request.serverId,
		model: request.model,
		think: wanted.has('thinking'),
		systemPrompt: request.systemPrompt?.trim() || undefined,
		messages: request.messages,
		flags: {
			webSearch: canSearch,
			webFetch: canFetch,
			// No client is watching, so there are no buttons to press: a question
			// asked as a choice would arrive in the room as an unanswerable list.
			interactiveChoices: false,
			sendCurrentDate: wanted.has('sendCurrentDate'),
			nativeTools: getSettings(user.id)?.nativeTools ?? 'auto',
			webSearchAuto: canSearch
		},
		capabilities: { search: canSearch, fetch: canFetch },
		// The account's own rewrites, resolved by the instance rather than claimed
		// by the caller: this path has no client to claim anything.
		promptOverrides: resolveAppPrompts(getSettings(user.id), principal.isAdmin).overrides
	};

	// Resolved before anything starts, so a refused model is an error the caller
	// can report rather than an empty answer it has to explain.
	const deps = serverDeps(input, principal);

	let text = '';
	let usage: TurnResult['usage'];
	let failure: string | null = null;

	const collect = (event: RunEvent): void => {
		// The finished message rather than the fragments: a turn can produce more
		// than one round, and only the messages are what a reader would have seen.
		if (event.type === 'message') text += (text ? '\n\n' : '') + event.message.content;
		else if (event.type === 'usage') {
			usage = event.used;
			// Counted here rather than by the caller, so a turn started from anywhere
			// lands in the same meter as one started from the browser. The bot spends
			// real money on somebody's account, and it was spending it invisibly.
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

	// A turn that failed halfway still emits what it had written, and that is
	// worth returning. A turn that failed with nothing is an error, said as one.
	if (failure && !text.trim()) throw new Error(failure);

	return { text: text.trim(), usage };
}
