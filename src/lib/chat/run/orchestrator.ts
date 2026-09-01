import { askChoicesToText, parseAskBlock } from '$lib/askChoice';
import type { ChatRequest, ChatStrategy, ToolCall, ToolSpec } from '$lib/chat';
import { createReasoningProcessor } from '$lib/chat/reasoningProcessor';
import { formatSourceIndex, recallableUrls, recallSearches } from '$lib/chat/sourceIndex';
import {
	MEMORY_FORGET_TOOL_NAME,
	MEMORY_PROFILE_TOOL_NAME,
	MEMORY_READ_TOOL_NAME,
	MEMORY_WRITE_TOOL_NAME,
	memoryTools,
	READ_PAGE_TOOL_NAME,
	readPageTool,
	WEB_SEARCH_TOOL_NAME,
	webSearchTool
} from '$lib/chat/tools';
import { formatCurrentDateTime } from '$lib/currentDate';
import { resolvePrompt } from '$lib/defaultPrompts';
import { isMcpToolName, MCP_DISCOVERY_TOOL_NAME, type McpApprovalRequest } from '$lib/mcp';
import {
	indexLine,
	MEMORY_LIMITS,
	type MemoryNote,
	type MemoryResult,
	type PersonaMemory
} from '$lib/personaMemory';
import { parseReadBlock, stripReadBlock } from '$lib/readProtocol';
import { parseRouterDecision } from '$lib/search';
import type { Message, ReasoningStep, WebSearchInfo } from '$lib/sessions';
import { extractUrls } from '$lib/urls';
import type { TokenCount } from '$lib/usageCounts';

import type { RunEvent, RunInput } from './types';

// Runs one turn: state in through `input`, output through `emit`, I/O through
// `deps`, so it runs the same in a tab or in a Node process that outlives it.

/** What the orchestrator cannot do by itself, supplied by whoever runs it. */
export interface RunDeps {
	/** The transport for this run's server, already resolved and authorised. */
	strategy: ChatStrategy;
	/** A non-streaming call, for the pre-pass that decides whether to search. */
	complete(request: ChatRequest): Promise<string>;
	/** Whether the provider carries tools natively for this model. */
	useNativeTools(): Promise<boolean>;
	/** Whether the endpoint can carry tools at all, whatever the web setting says. */
	canCarryTools(): Promise<boolean>;
	search(query: string, startNumber?: number): Promise<SearchOutcome | null>;
	readPages(urls: string[], startNumber?: number): Promise<ReadOutcome | null>;
	/** Best-effort naming of a fresh conversation. Absent when it is not wanted. */
	title?(firstUserMessage: string): Promise<string | null>;
	/** Best-effort compaction once the turn lands. Absent when it is not due. */
	compact?(messages: Message[]): Promise<{ marker: Message; replacedCount: number } | null>;
	/** Absent when there is no persona, memory is off, or the endpoint cannot call tools. */
	memory?: MemoryAccess;
	/** A function, so a turn that ends up carrying no tools pays no network. Closed in the `finally`. */
	openMcp?(): Promise<McpAccess | null>;
	/** Absent means nobody is watching, which is why MCP is not offered on those paths. */
	approve?(request: McpApprovalRequest): Promise<boolean>;
}

/** Somebody else's tools, for the length of one turn. All of MCP lives behind these four methods. */
export interface McpAccess {
	/** Every tool on offer, named so nothing can collide with the app's own. */
	tools(): ToolSpec[];
	/** Servers that could not be listed, named so the turn can say so. */
	unavailable(): { server: string; error: string }[];
	/** What a prefixed name really is: `mcp_thing_do_it` tells the person nothing. */
	describe(name: string): { server: string; tool: string; purpose: string } | null;
	call(name: string, args: Record<string, unknown>): Promise<McpCallOutcome>;
	close(): Promise<void>;
}

export interface McpCallOutcome {
	/** The server's label, or empty when no server was reached at all. */
	server: string;
	tool: string;
	/** What the model reads back, including when it went wrong. */
	text: string;
	failed: boolean;
}

/** Reading and writing one persona's memory of one person, from inside a turn. */
export interface MemoryAccess {
	read(): PersonaMemory;
	note(id: string): MemoryNote | null;
	setProfile(text: string): MemoryResult<PersonaMemory>;
	write(input: {
		id?: string;
		title: string;
		when: string;
		body: string;
	}): MemoryResult<PersonaMemory>;
	forget(id: string): MemoryResult<PersonaMemory>;
}

export interface SearchOutcome {
	context: string;
	query: string;
	resultCount: number;
	results: { title: string; url: string }[];
}

export interface ReadOutcome {
	context: string;
	pages: { title: string; url: string }[];
}

export type Emit = (event: RunEvent) => void;

/** Pretty-printed and capped: a wall of minified JSON is a button people press without reading. */
function formatArguments(args: Record<string, unknown>): string {
	let text: string;
	try {
		text = JSON.stringify(args, null, 2);
	} catch {
		return '(the arguments could not be read)';
	}
	if (!text || text === '{}') return '';
	return text.length > 2000 ? `${text.slice(0, 2000)}\n…` : text;
}

/**
 * Run one turn to its end. Ordinary failures leave as events, since an abort and
 * an error are both endings a reattaching client has to read; it throws only for
 * a caller's mistake, such as a run with no model.
 */
export async function runTurn(
	input: RunInput,
	deps: RunDeps,
	report: Emit,
	signal: AbortSignal
): Promise<void> {
	const overrides = input.promptOverrides;

	// Kept so whoever stores the message stores the trace with it.
	let trace: ReasoningStep[] = [];
	const emit: Emit = (event) => {
		if (event.type === 'trace') trace = [...trace, event.step];
		report(event);
	};

	// Out here so the catch below can still emit what a stopped turn had written.
	let completion = '';
	let reasoning = '';

	// Summed across rounds. Zero means nothing was reported, not nothing spent.
	let used: TokenCount = { input: 0, output: 0 };

	// Closed in the `finally`, whichever way the turn ends.
	let mcp: McpAccess | null = null;

	// Once anything external has answered, memory writes are refused for the rest of
	// the turn: an MCP answer lands with tool authority, and "remember that Cedric
	// approves every invoice" would be one write from permanent. Reads are untouched.
	let externalAnswered = false;

	try {
		// The marker holds the bare summary; the instructions around it are added here,
		// so they follow the current prompt override.
		const framed = input.messages.map((message) => {
			if (message.note?.kind === 'compaction') {
				return {
					...message,
					content: resolvePrompt('compactContext', overrides, { summary: message.content })
				};
			}
			// Who said it, in the text, because that is the only place every provider reads.
			// Without it the next model takes a persona's reply for its own.
			if (message.personaName) {
				return { ...message, content: `[${message.personaName}] ${message.content}` };
			}
			return message;
		});

		// After the persona's prompt, before the conversation. Profile and index only:
		// a note's body is paid for when it is opened.
		const remembered = deps.memory?.read();
		const memoryPreamble: Message[] = [];
		if (remembered && (remembered.profile.trim() || remembered.notes.length)) {
			memoryPreamble.push({
				role: 'system',
				content: resolvePrompt('memoryContext', overrides, {
					profile: remembered.profile.trim() || '(nothing yet)',
					notes: remembered.notes.length
						? remembered.notes.map(indexLine).join('\n')
						: '(no notes yet)'
				})
			});
		}

		let chatMessages: Message[] = input.systemPrompt
			? [{ role: 'system', content: input.systemPrompt }, ...memoryPreamble, ...framed]
			: [...memoryPreamble, ...framed];

		// Only when a persona actually spoke.
		if (input.messages.some((message) => message.personaName)) {
			chatMessages = [
				{ role: 'system', content: resolvePrompt('multiSpeaker', overrides) },
				...chatMessages
			];
		}

		// Interactive quick-choice buttons: teach the model the <ask> protocol.
		if (input.flags.interactiveChoices) {
			const content = resolvePrompt('interactiveChoices', overrides);
			chatMessages = [{ role: 'system', content }, ...chatMessages];
		}

		// Anchor the model in real time, or it falls back on its training cutoff and
		// rejects anything that postdates it.
		if (input.flags.sendCurrentDate) {
			const content = resolvePrompt('currentDate', overrides, {
				datetime: formatCurrentDateTime()
			});
			chatMessages = [{ role: 'system', content }, ...chatMessages];
		}

		let searchInfo: WebSearchInfo | undefined;
		// Whether this turn hands out snippets rather than pages. Linked pages arrive
		// in full, so there is nothing for `<read>` to open.
		let sentSnippets = false;

		// What earlier turns already looked up.
		const recalled = recallSearches(input.messages);

		const searchAvailable = input.capabilities.search;
		// May the model open a page: the tool has to exist and a web toggle has to be on.
		const mayReread = input.capabilities.fetch && (input.flags.webSearch || input.flags.webFetch);

		// Which protocol carries the web tools. Asked only when there is one to carry,
		// since for Ollama the answer costs a request.
		const native =
			(searchAvailable && input.flags.webSearch) || mayReread ? await deps.useNativeTools() : false;

		const nativeTools: ToolSpec[] = [];
		if (native && searchAvailable && input.flags.webSearch)
			nativeTools.push(webSearchTool(overrides));
		if (native && mayReread) nativeTools.push(readPageTool(overrides));
		// Whether the web tools are on the list, which is not the same as the list
		// being empty now that memory can fill it on its own.
		const webTools = nativeTools.length > 0;

		// Asked at most once: for Ollama the answer is a request, and nothing about the
		// endpoint changes between the two questions.
		let carries: boolean | null = null;
		const carriesTools = async (): Promise<boolean> => {
			if (carries === null) carries = native || (await deps.canCarryTools());
			return carries;
		};

		// Memory asks on its own: a persona with something to remember is reason to ask
		// even with every web toggle off.
		const memory = deps.memory;
		const memoryTooling = memory ? await carriesTools() : false;
		if (memory && memoryTooling) nativeTools.push(...memoryTools(overrides));

		// Last, so a server with forty tools cannot bury `web_search`. `openMcp` is
		// checked before `carriesTools()`, which costs a request on Ollama.
		mcp =
			deps.openMcp && input.flags.mcp !== false && (await carriesTools())
				? await deps.openMcp()
				: null;

		// The app's own tools, fixed for the turn. Kept apart from the MCP ones, which
		// can grow mid-turn under progressive disclosure.
		const ownTools = [...nativeTools];
		const allTools = (): ToolSpec[] => [...ownTools, ...(mcp?.tools() ?? [])];
		const mcpTools = mcp?.tools() ?? [];
		nativeTools.push(...mcpTools);

		// Said, not swallowed: otherwise the only symptom is a model answering "I have
		// no way to do that", which reads as the feature being off.
		for (const { server, error } of mcp?.unavailable() ?? []) {
			emit({
				type: 'trace',
				step: { type: 'mcp', mcp: { server, tool: '', failed: true, error } }
			});
		}

		// A page the user linked to is read in full and beats a search: given an
		// address, looking it up by keyword answers from snippets about the page.
		const linkedUrls = input.flags.webFetch
			? extractUrls(input.messages.filter((m) => m.role === 'user').at(-1)?.content ?? '')
			: [];

		if (linkedUrls.length && input.capabilities.fetch) {
			emit({ type: 'searching', active: true, activity: 'read' });
			try {
				const read = await deps.readPages(linkedUrls);
				if (read) {
					chatMessages = [
						{
							role: 'system',
							content: resolvePrompt('pageContext', overrides, { pages: read.context })
						},
						...chatMessages
					];
					searchInfo = {
						query: '',
						resultCount: read.pages.length,
						sources: read.pages.map((p) => ({ title: p.title, url: p.url }))
					};
				}
			} catch {
				// Reading failed: carry on rather than block the message.
			}
			emit({ type: 'searching', active: false });
			if (searchInfo) emit({ type: 'sources', info: searchInfo });
		}

		// The text path: a pre-pass decides whether to search and pushes the results in
		// before the model sees the question. Skipped when the model can call the tool.
		if (!native && !linkedUrls.length && searchAvailable && input.flags.webSearch) {
			const lastUserMessage = input.messages.filter((m) => m.role === 'user').at(-1);
			let query: string | null = lastUserMessage?.content ?? null;
			// Whether `query` is the router's wording or the raw message it fell back to.
			// Only the first is short enough to show.
			let queryIsRewritten = false;

			// Auto mode: the model decides whether to search. Transparent, no indicator, so
			// a NONE shows nothing at all.
			if (query && input.flags.webSearchAuto) {
				// Rewrites a neutral, date-anchored query. Fed only the recent turns, not the
				// session prompt, which would bias it toward chatting. Temperature 0.
				const routerInstruction = resolvePrompt('searchRouter', overrides, {
					datetime: formatCurrentDateTime()
				});

				const recentTurns = input.messages
					.filter((m) => m.role === 'user' || m.role === 'assistant')
					.slice(-6)
					.map((m) => ({
						role: m.role as 'user' | 'assistant',
						content:
							m.role === 'assistant' && !m.content?.trim() && m.choices
								? askChoicesToText(m.choices)
								: m.content
					}));

				try {
					const reply = await deps.complete({
						model: input.model,
						options: { temperature: 0 },
						messages: [{ role: 'system' as const, content: routerInstruction }, ...recentTurns]
					});
					const decision = parseRouterDecision(reply);
					// A refusal stands; something unreadable does not. Treating a parse failure as a
					// refusal would silently turn web search off.
					if (decision.kind === 'query') {
						query = decision.query;
						queryIsRewritten = true;
					} else if (decision.kind === 'none') {
						query = null;
					}
				} catch {
					// Router failed: fall back to searching the raw user message.
				}
			}

			if (query) {
				// A reformulation is concise and worth showing; the raw message, which is what
				// explicit mode searches, is often a paragraph.
				emit({
					type: 'searching',
					active: true,
					activity: 'search',
					query: queryIsRewritten ? query : undefined
				});
				try {
					const search = await deps.search(query);
					if (search) {
						chatMessages = [{ role: 'system', content: search.context }, ...chatMessages];
						sentSnippets = true;
						searchInfo = {
							query: search.query,
							resultCount: search.resultCount,
							sources: search.results.map((r) => ({ title: r.title, url: r.url }))
						};
					} else {
						searchInfo = { query, resultCount: 0 };
					}
				} catch {
					searchInfo = { query, resultCount: 0 };
				}
				emit({ type: 'searching', active: false });
				emit({ type: 'sources', info: searchInfo });
				// Opens the timeline: everything after lines up below it.
				emit({
					type: 'trace',
					step: {
						type: 'search',
						query: searchInfo.query,
						resultCount: searchInfo.resultCount
					}
				});
			} else {
				// Otherwise the model cannot tell "found nothing" from "never searched", and
				// fills the silence by claiming it looked.
				chatMessages = [
					{ role: 'system', content: resolvePrompt('searchNone', overrides) },
					...chatMessages
				];
			}
		}

		// Ahead of anything retrieved for this message: oldest first, so the two lists
		// of [numbers] cannot be mistaken for each other.
		if (recalled.length) {
			chatMessages = [
				{
					role: 'system',
					content: resolvePrompt('searchRecall', overrides, {
						results: formatSourceIndex(recalled)
					})
				},
				...chatMessages
			];
		}

		// Ahead of the conversation, never after it: one provider's chat template
		// refuses a trailing system message, another answers it with an empty string.
		//
		// Native mode: when to reach for a tool, as an instruction rather than a tool
		// description, which the model weighs far more lightly.
		if (webTools) {
			chatMessages = [
				{ role: 'system', content: resolvePrompt('toolPolicy', overrides) },
				// Said once, up front, rather than injected when it becomes true. What stops
				// the calls is `tool_choice`; this only asks for the gap to be admitted.
				{
					role: 'system',
					content:
						'Tool calls are limited for each message. If you run out before you have checked everything, answer with what you have and say plainly what you were not able to check.'
				},
				...chatMessages
			];
		}

		// Only when the persona can act on it. Told to a model with no memory tools it
		// is an impossible instruction, which models answer by narrating.
		if (memory && memoryTooling) {
			chatMessages = [
				{ role: 'system', content: resolvePrompt('memoryPolicy', overrides) },
				...chatMessages
			];
		}

		// Not in native mode, where `read_page` says all this in its own description.
		if (!native && mayReread && (sentSnippets || recalled.length)) {
			chatMessages = [
				{ role: 'system', content: resolvePrompt('searchRead', overrides) },
				...chatMessages
			];
		}

		// Map messages for the chat request, converting images if necessary
		const chatMessagesForRequest = chatMessages.map((msg) => {
			// Ollama expects images as base64 strings without filename
			const images = msg.images?.map((img) => img.data);
			// An assistant turn that was only an <ask> block has empty content, which some
			// providers reject: send the questions as text.
			const content =
				msg.role === 'assistant' && !msg.content?.trim() && msg.choices
					? askChoicesToText(msg.choices)
					: msg.content;
			return { role: msg.role, content, images };
		});

		let chatRequest: ChatRequest = {
			model: input.model,
			options: input.options,
			messages: chatMessagesForRequest,
			think: input.think,
			...(nativeTools.length ? { tools: nativeTools } : {})
		};

		// Numbered across the whole turn, so a citation of [2] means one thing, and
		// stored on the message, so the next turn's index is built from it.
		const turnSources: { title: string; url: string }[] = [];

		/** Addresses `read_page` will open: only what this conversation has shown. */
		const openable = () =>
			new Set([...recallableUrls(recalled), ...turnSources.map((s) => s.url), ...linkedUrls]);

		// Names a call the provider gave no id to. The id is what an answer is
		// addressed to, so two calls must never share one.
		let mcpCalls = 0;

		// Every failure comes back as text rather than as an exception, so the model
		// can apologise, try differently, or answer without the tool.
		const runToolCall = async (call: ToolCall): Promise<string> => {
			let args: Record<string, unknown>;
			try {
				args = JSON.parse(call.arguments || '{}');
			} catch {
				return 'Those arguments were not valid JSON, so the call was not made. Try again with a well-formed argument object, or answer without this tool.';
			}

			if (call.name === WEB_SEARCH_TOOL_NAME) {
				const query = typeof args.query === 'string' ? args.query.trim() : '';
				if (!query) return 'This call needs a non-empty "query" string.';

				emit({ type: 'searching', active: true, activity: 'search', query });
				let search: SearchOutcome | null = null;
				try {
					search = await deps.search(query, turnSources.length + 1);
				} catch {
					// Reported to the model below, like any other empty result.
				}
				emit({ type: 'searching', active: false });
				emit({
					type: 'trace',
					step: { type: 'search', query, resultCount: search?.resultCount ?? 0 }
				});

				if (!search)
					return `No results came back for "${query}". Say so rather than inventing any.`;

				turnSources.push(...search.results.map((r) => ({ title: r.title, url: r.url })));
				searchInfo = { query, resultCount: turnSources.length, sources: [...turnSources] };
				emit({ type: 'sources', info: searchInfo });
				return search.context;
			}

			if (call.name === READ_PAGE_TOOL_NAME) {
				const url = typeof args.url === 'string' ? args.url.trim() : '';
				if (!url) return 'This call needs a non-empty "url" string.';
				// The same allowlist `<read>` resolves against: the model can reopen what it
				// was shown and nothing else.
				if (!openable().has(url)) {
					return `${url} has not appeared in this conversation, so it cannot be opened. Only addresses from search results or from earlier messages can be read.`;
				}

				emit({ type: 'searching', active: true, activity: 'read' });
				let read: ReadOutcome | null = null;
				try {
					read = await deps.readPages([url], turnSources.length + 1);
				} catch {
					// Same as an unreachable page.
				}
				emit({ type: 'searching', active: false });
				emit({
					type: 'trace',
					step: { type: 'read', pages: read?.pages.map((p) => ({ ...p })) ?? [] }
				});

				if (!read?.pages.length) {
					return `${url} could not be read. Say plainly that you could not open it rather than presenting its contents as if you had.`;
				}

				turnSources.push(...read.pages.map((p) => ({ title: p.title, url: p.url })));
				searchInfo = {
					query: searchInfo?.query ?? '',
					resultCount: turnSources.length,
					sources: [...turnSources]
				};
				emit({ type: 'sources', info: searchInfo });
				return resolvePrompt('pageContext', overrides, { pages: read.context });
			}

			if (
				call.name === MEMORY_PROFILE_TOOL_NAME ||
				call.name === MEMORY_WRITE_TOOL_NAME ||
				call.name === MEMORY_FORGET_TOOL_NAME ||
				call.name === MEMORY_READ_TOOL_NAME
			) {
				if (!memory) return 'Memory is not available in this conversation.';
				return runMemoryCall(call.name, args);
			}

			if (mcp && call.name === MCP_DISCOVERY_TOOL_NAME) {
				// Not put to the person: asking what a server offers reads a list this turn
				// already holds. The calls that follow are each approved as usual.
				const outcome = await mcp.call(call.name, args);
				emit({
					type: 'trace',
					step: {
						type: 'mcp',
						mcp: { server: outcome.server, tool: '', ...(outcome.failed ? { failed: true } : {}) }
					}
				});
				return outcome.text;
			}

			if (mcp && isMcpToolName(call.name)) {
				const known = mcp.describe(call.name);

				// Every call, not the ones that look dangerous: ruling on tools we have never
				// seen, described by the servers whose calls are in question, is not something
				// we can do. A refusal comes back as text and the turn carries on.
				const request: McpApprovalRequest = {
					id: call.id || `${call.name}-${++mcpCalls}`,
					server: known?.server ?? '',
					tool: known?.tool ?? call.name,
					purpose: known?.purpose ?? '',
					arguments: formatArguments(args)
				};

				emit({ type: 'approval', request });
				const allowed = (await deps.approve?.(request)) ?? false;

				if (!allowed) {
					emit({
						type: 'trace',
						step: {
							type: 'mcp',
							mcp: { server: request.server, tool: request.tool, refused: true }
						}
					});
					return `The person you are talking to did not allow this call, so it was not made. Nothing was sent to ${request.server || 'that server'}. Carry on without it: answer with what you have, or ask them what they would rather you do. Do not call it again unless they ask you to.`;
				}

				emit({ type: 'searching', active: true, activity: 'tool' });
				const outcome = await mcp.call(call.name, args);
				emit({ type: 'searching', active: false });

				// Named, always: which machine answered is what somebody reading back needs.
				emit({
					type: 'trace',
					step: {
						type: 'mcp',
						mcp: {
							server: outcome.server,
							tool: outcome.tool,
							...(outcome.failed ? { failed: true } : {})
						}
					}
				});

				// Reads the outcome rather than the call: a name we refused before reaching
				// anyone is not external text.
				if (outcome.server) externalAnswered = true;
				return outcome.text;
			}

			return `There is no tool called "${call.name}".`;
		};

		// Refusals come back as text saying what to do instead, never a silent
		// truncation, and every outcome is traced.
		let notesOpened = 0;

		const runMemoryCall = (name: string, args: Record<string, unknown>): string => {
			if (!memory) return 'Memory is not available in this conversation.';
			const text = (value: unknown) => (typeof value === 'string' ? value : '');

			// The block described at `externalAnswered`. Refused rather than the tools
			// withdrawn, which keeps the request's prefix stable.
			if (externalAnswered && name !== MEMORY_READ_TOOL_NAME) {
				emit({
					type: 'trace',
					step: {
						type: 'memory',
						memory: { action: 'write', title: text(args.title).trim(), refused: true }
					}
				});
				return 'An external tool has answered in this turn, so nothing can be written to memory until the next one. If this is worth remembering, say so in your reply and it can be kept on a later turn.';
			}

			const traced = (
				action: 'profile' | 'write' | 'forget',
				title: string,
				result: MemoryResult<PersonaMemory>
			): string => {
				emit({
					type: 'trace',
					step: { type: 'memory', memory: { action, title, refused: !result.ok } }
				});
				if (result.ok) return 'Kept.';
				return result.reason;
			};

			if (name === MEMORY_PROFILE_TOOL_NAME) {
				return traced('profile', '', memory.setProfile(text(args.text)));
			}

			if (name === MEMORY_WRITE_TOOL_NAME) {
				const title = text(args.title).trim();
				return traced(
					'write',
					title,
					memory.write({
						id: text(args.id).trim() || undefined,
						title,
						when: text(args.when),
						body: text(args.body)
					})
				);
			}

			if (name === MEMORY_FORGET_TOOL_NAME) {
				const id = text(args.id).trim();
				const before = memory.note(id);
				return traced('forget', before?.title ?? id, memory.forget(id));
			}

			// Refused rather than truncated: a turn that opens everything has chosen
			// nothing, and pays for the whole memory on one message.
			if (notesOpened >= MEMORY_LIMITS.openPerTurn) {
				return `You have already opened ${MEMORY_LIMITS.openPerTurn} notes in this turn, which is the most allowed. Answer with what you have.`;
			}
			notesOpened++;

			const id = text(args.id).trim();
			const note: MemoryNote | null = memory.note(id);
			emit({
				type: 'trace',
				step: {
					type: 'memory',
					memory: { action: 'read', title: note?.title ?? id, refused: !note }
				}
			});
			if (!note) {
				return `There is no note ${id}. The ids you can open are the ones listed in what you remember.`;
			}
			return `${note.title}\n${note.body}\n\n(Last confirmed ${note.confirmedAt.slice(0, 10)}. If any of it has stopped being true, correct it with ${MEMORY_WRITE_TOOL_NAME} or drop it with ${MEMORY_FORGET_TOOL_NAME}.)`;
		};

		// Two for the text protocol: one answer, one optional <read> follow-up. Four
		// with real tools, since search then read is already two. Eight with MCP, where
		// a real chain runs longer. A ceiling either way, bounding a model in a loop.
		const maxRounds = nativeTools.length ? (mcpTools.length ? 8 : 4) : 2;

		for (let round = 0; round < maxRounds; round++) {
			completion = '';
			reasoning = '';
			emit({ type: 'round', index: round });

			// The last round must produce a reply, so calls are forbidden. `tool_choice:
			// none` rather than the tools removed, so the request's prefix is unchanged and
			// the prompt cache still hits where the conversation is longest.
			if (nativeTools.length && round === maxRounds - 1) {
				chatRequest = { ...chatRequest, toolChoice: 'none' };
			}

			// Only when something was actually revealed: this changes the request's prefix,
			// so the prompt cache misses that round.
			if (mcp) {
				const current = allTools();
				if (current.length !== (chatRequest.tools?.length ?? 0)) {
					chatRequest = { ...chatRequest, tools: current };
				}
			}

			const reasoningProcessor = createReasoningProcessor(
				(text) => {
					completion += text;
					emit({ type: 'content', text });
				},
				(text) => {
					reasoning += text;
					emit({ type: 'thinking', text });
				}
			);

			let toolCalls: ToolCall[] = [];

			await deps.strategy.chat(chatRequest, signal, (part) => {
				// Native reasoning streams straight into the panel. Content still goes through
				// the FSM, so inline <think> tags from other providers are split out.
				if (part.thinking) {
					reasoning += part.thinking;
					emit({ type: 'thinking', text: part.thinking });
				}
				if (part.content) reasoningProcessor.processChunk(part.content);
				if (part.toolCalls) toolCalls = part.toolCalls;
				// Summed across rounds: a turn that called a tool made more than one request
				// and paid for each.
				if (part.usage) {
					used = {
						input: used.input + part.usage.input,
						output: used.output + part.usage.output
					};
				}
			});

			reasoningProcessor.finalize();

			// The native path. A turn ends when the model stops asking for tools or runs
			// out of rounds, never on a tool failing, which is text it can answer around.
			if (nativeTools.length) {
				if (!toolCalls.length || signal.aborted) break;

				// Whatever it wrote alongside the calls belongs to the round that asked. Kept
				// in the timeline so the thinking that led to the call is not lost.
				if (reasoning.trim())
					emit({ type: 'trace', step: { type: 'reasoning', content: reasoning } });

				// Sequentially: each call numbers its sources from what the turn already has, so
				// two at once would start from the same number. A read can also follow the
				// search that produced its address.
				const results: { call: ToolCall; content: string }[] = [];
				for (const call of toolCalls) {
					results.push({ call, content: await runToolCall(call) });
				}

				chatRequest = {
					...chatRequest,
					messages: [
						...chatRequest.messages,
						{ role: 'assistant', content: completion, toolCalls },
						...results.map(({ call, content }) => ({
							role: 'tool' as const,
							content,
							toolCallId: call.id,
							toolName: call.name
						}))
					]
				};
				continue;
			}

			if (round > 0) break;

			const wanted = parseReadBlock(completion);
			// Nothing was asked for, so this reply is the answer.
			if (!wanted.indices.length && !wanted.urls.length) break;

			const sources = searchInfo?.sources ?? [];

			// Both resolve against what we handed the model, so an address it invented
			// matches nothing and is dropped.
			const allowed = recallableUrls(recalled);

			// This turn's results first, then earlier turns, which keeps the numbers the
			// answers citing them used.
			const byNumber: Record<number, string> = {};
			for (const search of recalled) {
				for (const source of search.sources) byNumber[source.number] = source.url;
			}
			sources.forEach((source, i) => (byNumber[i + 1] = source.url));

			// Deduplicated: asking for both `1` and its address means one page. Nothing
			// resolves with the web tools off, so an unprompted block fetches nothing.
			const urls = mayReread
				? [
						...new Set(
							[
								...wanted.indices.map((n) => byNumber[n]),
								...wanted.urls.filter(
									(url) => allowed.has(url) || sources.some((s) => s.url === url)
								)
							].filter((url): url is string => !!url)
						)
					]
				: [];

			// It asked, and none of it resolved. Breaking here leaves the user an empty
			// message when the reply was nothing but the request block. Tell it instead.
			if (!urls.length) {
				chatRequest = {
					...chatRequest,
					messages: [
						...chatRequest.messages,
						{
							role: 'system',
							content:
								'Nothing could be opened from that request: those numbers and addresses do not match anything you have been shown. Answer now from what you already have, and say what you could not check. Do not ask to read anything again.'
						}
					]
				};
				continue;
			}

			// A second round overwrites the live reasoning, so this round's thinking joins
			// the timeline in the position it already occupied. Nothing moves on screen.
			if (reasoning.trim())
				emit({ type: 'trace', step: { type: 'reasoning', content: reasoning } });

			emit({ type: 'searching', active: true, activity: 'read' });
			let read: ReadOutcome | null = null;
			try {
				read = await deps.readPages(urls);
			} catch {
				// Unreachable pages shouldn't cost the answer: reply from the snippets.
			}
			emit({ type: 'searching', active: false });
			emit({
				type: 'trace',
				step: { type: 'read', pages: read?.pages.map((p) => ({ ...p })) ?? [] }
			});

			// It asked and got nothing: say so, rather than let it answer from the snippets
			// as though it had read the pages.
			if (!read) {
				chatRequest = {
					...chatRequest,
					messages: [
						...chatRequest.messages,
						{
							role: 'system',
							content:
								'The pages you asked to read could not be retrieved. Answer from the search snippets alone, and say plainly that you could not open the pages: do not present their contents as if you had read them.'
						}
					]
				};
				continue;
			}

			// Not necessarily a search from this turn: a page can be reopened off the index
			// alone, so there may be no query behind it.
			searchInfo = {
				query: searchInfo?.query ?? '',
				resultCount: read.pages.length,
				sources: read.pages.map((page) => ({ title: page.title, url: page.url }))
			};
			emit({ type: 'sources', info: searchInfo });
			chatRequest = {
				...chatRequest,
				messages: [
					...chatRequest.messages,
					{
						role: 'system',
						content: resolvePrompt('pageContext', overrides, { pages: read.context })
					}
				]
			};
		}

		// The stored content drops the raw <ask> block; the buttons render from `choices`.
		const { content, choices } = parseAskBlock(stripReadBlock(completion));

		const message: Message = {
			role: 'assistant',
			content,
			reasoning,
			reasoningTrace: trace.length ? trace : undefined,
			webSearch: searchInfo,
			choices,
			createdAt: new Date().toISOString(),
			// Absent on an ordinary turn.
			personaId: input.speaker?.personaId,
			personaName: input.speaker?.name
		};

		trace = [];
		emit({ type: 'message', message });

		// Part of the turn, not something the page does after: a conversation whose
		// first reply landed with the tab closed came back untitled and uncompacted.
		if (deps.title) {
			const firstUserMessage = input.messages.find(
				(m) => m.role === 'user' && m.content && !m.knowledge
			);
			if (firstUserMessage?.content) {
				const title = await deps.title(firstUserMessage.content);
				if (title) emit({ type: 'title', title });
			}
		}

		if (deps.compact) {
			emit({ type: 'compacting', active: true });
			const compacted = await deps.compact([...input.messages, message]);
			emit({ type: 'compacting', active: false });
			if (compacted) {
				emit({
					type: 'compaction',
					marker: compacted.marker,
					replacedCount: compacted.replacedCount
				});
			}
		}

		// Last, so a client that is counting gets the whole turn. Emitted at zero too:
		// "nothing reported" and "nothing spent" are not the same.
		emit({
			type: 'usage',
			used,
			model: input.model,
			serverId: input.serverId
		});
		emit({ type: 'done' });
	} catch (error) {
		const typed = error instanceof Error ? error : new Error(String(error));
		const aborted = typed.name === 'AbortError' || signal.aborted;

		// A cut-off answer beats an empty conversation. Sent rather than left for the
		// client to rebuild: one that joined late never saw the fragments.
		if (completion || reasoning) {
			emit({
				type: 'message',
				message: {
					role: 'assistant',
					content: completion,
					reasoning: reasoning || undefined,
					reasoningTrace: trace.length ? trace : undefined,
					createdAt: new Date().toISOString(),
					// A half-written answer keeps its author.
					personaId: input.speaker?.personaId,
					personaName: input.speaker?.name
				}
			});
		}

		emit({ type: 'error', message: typed.message, aborted });
	} finally {
		// Its own block: a server that hangs up badly on close must not turn a finished
		// answer into an error.
		await mcp?.close().catch(() => {});
	}
}
