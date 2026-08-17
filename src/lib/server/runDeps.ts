import { env as privateEnv } from '$env/dynamic/private';
import { env as publicEnv } from '$env/dynamic/public';
import type { ChatRequest, ChatStrategy } from '$lib/chat';
import { compactTranscript } from '$lib/chat/compact';
import { stripThinkTags } from '$lib/chat/index';
import { OllamaStrategy } from '$lib/chat/ollama';
import { OpenAIStrategy } from '$lib/chat/openai';
import type { RunDeps } from '$lib/chat/run/orchestrator';
import type { RunInput } from '$lib/chat/run/types';
import { stripTitleMarkdown, TITLE_SYSTEM_PROMPT } from '$lib/chat/titleText';
import { useNativeTools } from '$lib/chat/tools';
import { ConnectionType, type Server } from '$lib/connections';
import { resolvePrompt } from '$lib/defaultPrompts';
import { getSettings } from '$lib/server/db/collections';
import { getServer, getServerApiKey, type ServerRow } from '$lib/server/db/servers';
import { fetchPage } from '$lib/server/fetchPage';
import { policeChatBody, PolicyError, type ChatBody } from '$lib/server/llmPolicy';
import { webSearch, type SearchTarget } from '$lib/server/search';
import { resolveSearch } from '$lib/server/searchResolver';
import { resolveTools, WEB_FETCH_CEILINGS, WEB_FETCH_DEFAULTS } from '$lib/server/toolsResolver';
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

const isServerMode = publicEnv.PUBLIC_MODE === 'server';

export interface RunPrincipal {
	/** Null in local mode, where there are no accounts to be. */
	userId: string | null;
	isAdmin: boolean;
}

/** The connection a run names, resolved by the only party allowed to resolve it. */
export function resolveRunServer(input: RunInput, principal: RunPrincipal): Server {
	if (isServerMode) {
		if (input.server.kind !== 'id') {
			// A browser handing over a URL and a key is how local mode works and is
			// meaningless here: server mode's whole point is that the client never
			// holds either.
			throw new PolicyError(400, 'This instance resolves servers by id');
		}
		const row = getServer(input.server.id);
		if (!row) throw new PolicyError(404, 'Server not found');
		if (row.owner_user_id !== null && row.owner_user_id !== principal.userId) {
			throw new PolicyError(403, 'Not your server');
		}
		return fromRow(row);
	}

	if (input.server.kind !== 'inline') throw new PolicyError(400, 'Expected a connection');
	return input.server.server;
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
		isVerified: row.verified_at ? new Date(row.verified_at) : null
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

	if (isServerMode) {
		if (!principal.userId) return null;
		const resolved = resolveSearch(getSettings(principal.userId), principal.isAdmin);
		return resolved.url
			? { url: resolved.url, backend: resolved.backend, token: resolved.token }
			: null;
	}

	const own = input.local?.search;
	return own?.url ? { url: own.url, backend: own.backend, token: own.token } : null;
}

/** How much of a page may be read, with the instance's ceilings applied either way. */
function fetchLimits(
	input: RunInput,
	principal: RunPrincipal
): { maxPages: number; maxChars: number } | null {
	if (isServerMode) {
		if (!principal.userId) return null;
		const tools = resolveTools(getSettings(principal.userId), principal.isAdmin);
		if (!tools.webFetch) return null;
		return { maxPages: tools.maxPages, maxChars: tools.maxChars };
	}

	const own = input.local?.fetch;
	return {
		maxPages: Math.min(own?.maxPages || WEB_FETCH_DEFAULTS.maxPages, WEB_FETCH_CEILINGS.maxPages),
		maxChars: Math.min(own?.maxChars || WEB_FETCH_DEFAULTS.maxChars, WEB_FETCH_CEILINGS.maxChars)
	};
}

export function serverDeps(input: RunInput, principal: RunPrincipal): RunDeps {
	const server = resolveRunServer(input, principal);
	const row =
		isServerMode && input.server.kind === 'id' ? (getServer(input.server.id) ?? null) : null;
	const strategy = policed(strategyFor(server), row, principal.isAdmin);

	const target = searchTarget(input, principal);
	const limits = fetchLimits(input, principal);
	const overrides = input.promptOverrides;

	/** One conversation with a model, for the small jobs that are not the turn itself. */
	const oneShot = async (model: string, messages: Message[], serverId?: string) => {
		const helperServer = serverId && serverId !== server.id ? helper(serverId, principal) : server;
		if (!helperServer) return '';
		const helperRow = isServerMode && serverId ? (getServer(serverId) ?? row) : row;
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
					const page = await fetchPage(url, limits.maxChars);
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

		title: input.title
			? async (first: string) => {
					try {
						const raw = await oneShot(
							input.title!.model,
							[
								{ role: 'system', content: TITLE_SYSTEM_PROMPT },
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

function helper(serverId: string, principal: RunPrincipal): Server | null {
	if (!isServerMode) return null;
	const row = getServer(serverId);
	if (!row) return null;
	if (row.owner_user_id !== null && row.owner_user_id !== principal.userId) return null;
	return fromRow(row);
}
