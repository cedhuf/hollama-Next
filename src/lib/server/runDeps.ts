import { env as privateEnv } from '$env/dynamic/private';
import { env as publicEnv } from '$env/dynamic/public';
import type { ChatRequest, ChatStrategy } from '$lib/chat';
import { compactTranscript } from '$lib/chat/compact';
import { stripThinkTags } from '$lib/chat/index';
import { OllamaStrategy } from '$lib/chat/ollama';
import { OpenAIStrategy } from '$lib/chat/openai';
import { parseLoadOptions } from '$lib/chat/options';
import { refusal } from '$lib/chat/refusal';
import type { RunDeps } from '$lib/chat/run/orchestrator';
import type { RunInput } from '$lib/chat/run/types';
import { stripTitleMarkdown } from '$lib/chat/titleText';
import { canCarryTools, useNativeTools } from '$lib/chat/tools';
import { ConnectionType, type Server } from '$lib/connections';
import { resolvePrompt } from '$lib/defaultPrompts';
import type { McpApprovalRequest } from '$lib/mcp';
import { getSettings } from '$lib/server/db/collections';
import { getServer, getServerApiKey, type ServerRow } from '$lib/server/db/servers';
import { allowedFetchOrigins, fetchPage } from '$lib/server/fetchPage';
import { policeChatBody, PolicyError, reachableServer, type ChatBody } from '$lib/server/llmPolicy';
import { hasMcpServers, openMcpSession } from '$lib/server/mcp/session';
import { serverMemory } from '$lib/server/personaMemoryAccess';
import { webSearch, type SearchTarget } from '$lib/server/search';
import { resolveSearch } from '$lib/server/searchResolver';
import { resolveTools } from '$lib/server/toolsResolver';
import { refuseForCredit } from '$lib/server/usageMeter';
import type { Message } from '$lib/sessions';

/**
 * What a turn running in this process can reach.
 *
 * The mirror of the browser's own wiring, and the reason the orchestrator takes
 * its capabilities as arguments: the steps are identical, only the way out is
 * different. Here the search and the page reads are function calls rather than
 * requests back to ourselves, and the provider is addressed directly rather than
 * through the proxy.
 *
 * Addressing it directly is exactly what makes the policy below load-bearing.
 * The proxy used to be the only path a request could take, so the admin's rules
 * lived there. This is a second path, so they have to be applied on it too, or
 * running a turn server-side would be a way to ask for a model nobody shared.
 */

export interface RunPrincipal {
	userId: string;
	isAdmin: boolean;
}

/**
 * The connection a run names, resolved by the only party allowed to resolve it.
 *
 * The same three questions `requireServer` asks of a request: does it exist, is
 * it this account's, and is it switched on. The last one was missing here, which
 * meant a connection an administrator had switched off still answered a turn
 * started on this side, while refusing the identical turn typed in the browser.
 */
export function resolveRunServer(input: RunInput, principal: RunPrincipal): Server {
	return fromRow(reachableServer(principal.userId, input.serverId));
}

function fromRow(row: ServerRow): Server {
	return {
		id: row.id,
		connectionType: row.connection_type as ConnectionType,
		baseUrl: row.base_url,
		apiKey: getServerApiKey(row) ?? '',
		label: row.label ?? undefined,
		modelFilter: row.model_filter ?? undefined,
		isEnabled: !!row.is_enabled,
		isVerified: row.verified_at ? new Date(row.verified_at) : null,
		// Carried here rather than merged at the call site: every request a turn
		// makes goes through a strategy built from this, so the machine settings
		// ride along without the orchestrator, the summariser or the router each
		// having to remember them.
		loadOptions: parseLoadOptions(row.load_options)
	};
}

/**
 * A strategy that answers to the admin before it answers to the model.
 *
 * Wrapped rather than checked at the call sites: every request a turn makes has
 * to pass, including the router's pre-pass and the summariser's, and a check
 * written once per call site is a check that will be missing from the next one.
 */
function policed(strategy: ChatStrategy, row: ServerRow | null, isAdmin: boolean): ChatStrategy {
	if (!row) return strategy;

	// The policy speaks in terms of a request body, which a `ChatRequest` is: the
	// cast says so once rather than loosening the policy's own signature.
	const vet = (payload: ChatRequest): ChatRequest =>
		policeChatBody(row, isAdmin, payload as unknown as ChatBody) as unknown as ChatRequest;

	return {
		chat: (payload, signal, onChunk) => strategy.chat(vet(payload), signal, onChunk),
		getModels: () => strategy.getModels(),
		complete: strategy.complete ? (payload) => strategy.complete!(vet(payload)) : undefined
	};
}

function strategyFor(server: Server): ChatStrategy {
	const options = { direct: true };
	return server.connectionType === ConnectionType.Ollama
		? new OllamaStrategy(server, options)
		: new OpenAIStrategy(server, options);
}

/** Where a search goes, decided by the instance in server mode and by the browser otherwise. */
function searchTarget(input: RunInput, principal: RunPrincipal): SearchTarget | null {
	const envUrl = publicEnv.PUBLIC_SEARCH_URL?.trim();
	if (envUrl) {
		return {
			url: envUrl,
			backend: publicEnv.PUBLIC_SEARCH_BACKEND?.trim() || 'degoog',
			token: privateEnv.SEARCH_TOKEN?.trim() || ''
		};
	}

	const resolved = resolveSearch(getSettings(principal.userId), principal.isAdmin);
	return resolved.url
		? { url: resolved.url, backend: resolved.backend, token: resolved.token }
		: null;
}

/** How much of a page may be read, with the instance's ceilings applied either way. */
function fetchLimits(
	input: RunInput,
	principal: RunPrincipal
): { maxPages: number; maxChars: number } | null {
	const tools = resolveTools(getSettings(principal.userId), principal.isAdmin);
	if (!tools.webFetch) return null;
	return { maxPages: tools.maxPages, maxChars: tools.maxChars };
}

/**
 * The credit limit, applied on this path too.
 *
 * It used to live only in `/api/llm`, which is the browser's way out and is not
 * the only one any more: a turn running in this process talks to the provider
 * itself, so an account over its allowance kept spending as long as the turn
 * started server-side. The same oversight the policy above was written to
 * close, on the one rule that was left behind.
 *
 * Asked before the turn starts and never during one, exactly as the proxy asks
 * it: a conversation already under way always finishes.
 */
function policeCredit(row: ServerRow | null, model: string, principal: RunPrincipal): void {
	if (!row) return;
	const refused = refuseForCredit(principal.userId, row, model);
	if (refused) throw new PolicyError(402, refusal(refused));
}

/**
 * What the caller supplies that the turn cannot get for itself.
 *
 * One entry, and it is what decides whether MCP happens at all. Every MCP call
 * is put to a person before it is made, so a path with nobody to ask has no
 * business making them: `approve` absent means the catalogues are never opened.
 *
 * That is why bots have none. A bot answers to people who are not the account
 * holder, in a room the account holder may not be reading: there is no one to put
 * the question to, and letting the room through by asking the bot nicely is an
 * escalation nobody granted. The same goes for a spoken turn, where the answer
 * would have to be a dialog nobody is looking at.
 */
export interface DepsOptions {
	approve?: (request: McpApprovalRequest) => Promise<boolean>;
	/**
	 * MCP with nobody to ask, every call allowed.
	 *
	 * The one deliberate hole in the rule above, and it is the owner's to open: a
	 * bot with `mcp` ticked runs its calls unasked, because there is no one at the
	 * other end of its turn. Written as its own option rather than as an absent
	 * `approve`, so that no path acquires it by forgetting something.
	 */
	mcpUnattended?: boolean;
}

export function serverDeps(
	input: RunInput,
	principal: RunPrincipal,
	options: DepsOptions = {}
): RunDeps {
	const server = resolveRunServer(input, principal);
	const row = getServer(input.serverId) ?? null;
	policeCredit(row, input.model, principal);
	const strategy = policed(strategyFor(server), row, principal.isAdmin);

	const target = searchTarget(input, principal);
	const limits = fetchLimits(input, principal);
	const overrides = input.promptOverrides;

	/** One conversation with a model, for the small jobs that are not the turn itself. */
	const oneShot = async (model: string, messages: Message[], serverId?: string) => {
		const helperServer = serverId && serverId !== server.id ? helper(serverId, principal) : server;
		if (!helperServer) return '';
		const helperRow = serverId ? (getServer(serverId) ?? row) : row;
		const strat = policed(strategyFor(helperServer), helperRow, principal.isAdmin);
		let out = '';
		await strat.chat(
			{
				model,
				messages: messages.map((m) => ({ role: m.role, content: m.content })),
				think: false
			},
			new AbortController().signal,
			(part) => {
				out += part.content ?? '';
			}
		);
		return stripThinkTags(out);
	};

	return {
		strategy,

		complete: async (request) => (await strategy.complete?.(request)) ?? '',

		useNativeTools: () => useNativeTools(server, input.model, input.flags.nativeTools),

		canCarryTools: () => canCarryTools(server, input.model, input.flags.nativeTools),

		/**
		 * The account's MCP servers, opened when the turn asks for them.
		 *
		 * Resolved here rather than carried in the run's body for the same reason
		 * memory is: the servers belong to the signed-in account, and a client is
		 * not entitled to say which addresses a turn may reach out to.
		 */
		approve: options.approve ?? (options.mcpUnattended ? async () => true : undefined),

		openMcp:
			(options.approve || options.mcpUnattended) &&
			hasMcpServers(principal.userId, principal.isAdmin)
				? () => openMcpSession(principal.userId, principal.isAdmin)
				: undefined,

		async search(query, startNumber = 1) {
			if (!target) return null;
			const results = await webSearch(query, target);
			if (!results.length) return null;
			const body = results
				.map((r, i) => `[${startNumber + i}] ${r.title}\n${r.url}\n${r.snippet}`)
				.join('\n\n');
			return {
				context: resolvePrompt('searchContext', overrides, { results: body }),
				query,
				resultCount: results.length,
				results: results.map((r) => ({ title: r.title, url: r.url }))
			};
		},

		async readPages(urls, startNumber = 1) {
			if (!limits) return null;
			const wanted = urls.slice(0, limits.maxPages);
			if (!wanted.length) return null;

			const pages: { title: string; url: string; text: string }[] = [];
			for (const url of wanted) {
				try {
					// The allow-list, which this path used to skip: it was applied only by
					// the browser-facing route, so the setting restricted the caller that
					// no longer exists and never the turn that actually reads the page.
					const page = await fetchPage(url, limits.maxChars, allowedFetchOrigins());
					pages.push({ title: page.title, url: page.url, text: page.text });
				} catch {
					// One unreachable page must not cost the others, exactly as the
					// endpoint does it: failures are reported, not thrown.
				}
			}
			if (!pages.length) return null;

			const body = pages
				.map((p, i) => `[${startNumber + i}] ${p.title}\n${p.url}\n${p.text}`)
				.join('\n\n');
			return { context: body, pages: pages.map((p) => ({ title: p.title, url: p.url })) };
		},

		// The speaker's own persona when somebody was called in with @, and the
		// conversation's otherwise. The account comes from the principal, never
		// from the body: naming whose memory to read is not a client's call.
		memory: serverMemory(principal.userId, input.speaker?.personaId ?? input.personaId),

		title: input.title
			? async (first: string) => {
					try {
						const raw = await oneShot(
							input.title!.model,
							[
								{ role: 'system', content: resolvePrompt('conversationTitle', overrides) },
								{ role: 'user', content: first }
							],
							input.title!.serverId
						);
						return stripTitleMarkdown(raw).slice(0, 80) || null;
					} catch {
						return null;
					}
				}
			: undefined,

		compact: input.compact
			? async (messages: Message[]) => {
					try {
						const transcript = compactTranscript(messages);
						if (!transcript) return null;
						const summary = await oneShot(
							input.compact!.model,
							[
								{ role: 'system', content: resolvePrompt('compact', overrides) },
								{ role: 'user', content: transcript }
							],
							input.compact!.serverId
						);
						if (!summary.trim()) return null;
						return {
							marker: {
								role: 'system',
								content: summary.trim(),
								createdAt: new Date().toISOString(),
								note: {
									kind: 'compaction',
									generatedAt: new Date().toISOString(),
									replacedCount: messages.length,
									model: input.compact!.model,
									automatic: true
								}
							},
							replacedCount: messages.length
						};
					} catch {
						// Best-effort, like every automatic compaction: the answer already
						// landed, and a summary that failed costs one longer request.
						return null;
					}
				}
			: undefined
	};
}

/**
 * A connection for one of the small jobs around a turn: a title, a compaction.
 *
 * Nothing rather than a refusal, because none of these is the answer somebody is
 * waiting for: a title that cannot be written is a conversation without one, not
 * a turn that failed. The three questions are the same ones as everywhere else.
 */
function helper(serverId: string, principal: RunPrincipal): Server | null {
	try {
		return fromRow(reachableServer(principal.userId, serverId));
	} catch {
		return null;
	}
}
