import { askChoicesToText, parseAskBlock } from '$lib/askChoice';
import type { ChatRequest, ChatStrategy, ToolCall, ToolSpec } from '$lib/chat';
import { createReasoningProcessor } from '$lib/chat/reasoningProcessor';
import { formatSourceIndex, recallableUrls, recallSearches } from '$lib/chat/sourceIndex';
import { READ_PAGE_TOOL, WEB_SEARCH_TOOL } from '$lib/chat/tools';
import { formatCurrentDateTime } from '$lib/currentDate';
import { resolvePrompt } from '$lib/defaultPrompts';
import { parseReadBlock, stripReadBlock } from '$lib/readProtocol';
import { parseRouterDecision } from '$lib/search';
import type { Message, WebSearchInfo } from '$lib/sessions';
import { extractUrls } from '$lib/urls';
import type { TokenCount } from '$lib/usageCounts';

import type { RunEvent, RunInput } from './types';

/**
 * The turn itself, and nothing else.
 *
 * Everything that used to be read from a store arrives in `input`; everything
 * that used to be written to the editor leaves through `emit`; everything that
 * needs the network is a dependency. What is left is the part that is genuinely
 * about conducting a conversation, and it is the same part whether it runs in a
 * tab or in the Node process that outlives the tab.
 *
 * The behaviour is deliberately unchanged from the version that lived in the
 * page. The comments explaining why each step is the way it is have come with it,
 * because they are the reason the steps are in this order.
 */

/** What the orchestrator cannot do by itself, supplied by whoever runs it. */
export interface RunDeps {
	/** The transport for this run's server, already resolved and authorised. */
	strategy: ChatStrategy;
	/**
	 * A second transport for the pre-pass that decides whether to search.
	 *
	 * The same server, so the same strategy would do; it exists as its own entry
	 * only because the router is the one call that must not stream.
	 */
	complete(request: ChatRequest): Promise<string>;
	/** Whether the provider carries tools natively for this model. */
	useNativeTools(): Promise<boolean>;
	search(query: string, startNumber?: number): Promise<SearchOutcome | null>;
	readPages(urls: string[], startNumber?: number): Promise<ReadOutcome | null>;
	/** Best-effort naming of a fresh conversation. Absent when it is not wanted. */
	title?(firstUserMessage: string): Promise<string | null>;
	/** Best-effort compaction once the turn lands. Absent when it is not due. */
	compact?(messages: Message[]): Promise<{ marker: Message; replacedCount: number } | null>;
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

/**
 * Run one turn to its end.
 *
 * Never throws for an ordinary failure: an abort and an error are both endings a
 * reattaching client has to be able to read, so they leave as events. It throws
 * only for a caller's mistake, such as a run with no model.
 */
export async function runTurn(
	input: RunInput,
	deps: RunDeps,
	emit: Emit,
	signal: AbortSignal
): Promise<void> {
	const overrides = input.promptOverrides;

	/**
	 * What the provider says this turn consumed, across every round of it.
	 *
	 * Reported once at the end rather than per round: a turn that called two tools
	 * made three requests, and what somebody spent is the three added up. Zero
	 * when the provider reports nothing, which is how it is told apart from a turn
	 * that genuinely cost nothing.
	 */
	let used: TokenCount = { input: 0, output: 0 };

	try {
		// A stored marker holds the bare summary; the instructions that tell the model
		// how to treat it are put around it here, so they follow the current prompt
		// override rather than whatever it said the day the summary was written.
		const framed = input.messages.map((message) => {
			if (message.note?.kind === 'compaction') {
				return {
					...message,
					content: resolvePrompt('compactContext', overrides, { summary: message.content })
				};
			}
			// Who said it, in the text, because that is the only place every provider
			// reads. A reply written by a persona is an `assistant` message like any
			// other, so without this the next model to read the conversation takes it
			// for something it said itself, and carries on from words it never wrote.
			// `name` on a message would be the tidy answer and is not portable.
			if (message.personaName) {
				return { ...message, content: `[${message.personaName}] ${message.content}` };
			}
			return message;
		});

		let chatMessages: Message[] = input.systemPrompt
			? [{ role: 'system', content: input.systemPrompt }, ...framed]
			: framed;

		// Said once, and only when it is true: a conversation nobody was called into
		// reads exactly as it did before any of this existed.
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

		// Anchor the model in real time so it doesn't fall back on its training-cutoff
		// sense of "now" (and reject facts that postdate it). Led first in the context.
		if (input.flags.sendCurrentDate) {
			const content = resolvePrompt('currentDate', overrides, {
				datetime: formatCurrentDateTime()
			});
			chatMessages = [{ role: 'system', content }, ...chatMessages];
		}

		let searchInfo: WebSearchInfo | undefined;
		// Whether this turn hands the model snippets rather than pages. Pages the user
		// linked arrive in full, so there is nothing to open and `<read>` is not offered
		// for them; search results are two lines each, which is the whole reason it exists.
		let sentSnippets = false;

		// What earlier turns already looked up.
		const recalled = recallSearches(input.messages);

		const searchAvailable = input.capabilities.search;
		// Whether the model may open a page this turn: the tool has to exist, and the
		// user has to have left at least one of the web toggles on.
		const mayReread = input.capabilities.fetch && (input.flags.webSearch || input.flags.webFetch);

		// Which of the two protocols carries the web tools this turn. Asked only when
		// there is a tool to carry, since for Ollama the answer costs a request.
		const native =
			(searchAvailable && input.flags.webSearch) || mayReread ? await deps.useNativeTools() : false;

		const nativeTools: ToolSpec[] = [];
		if (native && searchAvailable && input.flags.webSearch) nativeTools.push(WEB_SEARCH_TOOL);
		if (native && mayReread) nativeTools.push(READ_PAGE_TOOL);

		// Pages the user linked to are read in full, and take precedence over a
		// search: given an address, looking it up by keyword is the wrong move —
		// the model would answer from snippets about the page instead of the page.
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
				// Reading failed: fall through to the normal flow rather than block the
				// message the user actually wants to send.
			}
			emit({ type: 'searching', active: false });
			if (searchInfo) emit({ type: 'sources', info: searchInfo });
		}

		// The text path: a pre-pass decides whether to search, and the results are
		// pushed into the context before the model ever sees the question. Skipped
		// entirely when the model can call the tool itself, which is the whole saving:
		// no extra request to decide on its behalf.
		if (!native && !linkedUrls.length && searchAvailable && input.flags.webSearch) {
			const lastUserMessage = input.messages.filter((m) => m.role === 'user').at(-1);
			let query: string | null = lastUserMessage?.content ?? null;
			// Whether `query` is the router's own wording or the raw user message it
			// fell back to. Only the first is short enough to be worth showing.
			let queryIsRewritten = false;

			// In auto mode the model first decides whether (and what) to search. This
			// phase is transparent (no indicator): if it replies NONE we skip the
			// search entirely and nothing is shown.
			if (query && input.flags.webSearchAuto) {
				// The query writer: decides whether to search and reformulates a neutral,
				// date-anchored query (query rewriting). Fed only the recent turns — not
				// the session system prompt, which would bias it toward chatting. Run at
				// temperature 0 for determinism. Editable in Settings → Tools.
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
					// A router that declines has answered the question, so its answer stands.
					// One that produced something unreadable has not: treating that as a
					// refusal turns any parse failure into "web search off for this message",
					// invisibly, and then tells the model it chose not to look anything up.
					// Falling back to the raw message is what explicit mode does anyway.
					if (decision.kind === 'query') {
						query = decision.query;
						queryIsRewritten = true;
					} else if (decision.kind === 'none') {
						query = null;
					}
				} catch {
					// Router failed — fall back to searching the raw user message.
				}
			}

			if (query) {
				// A reformulation by the router is concise and worth showing; the raw user
				// message, which is what both explicit mode and the router fallback search,
				// is often a paragraph long.
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
				// Opens the timeline: everything the turn does afterwards lines up below it.
				emit({
					type: 'trace',
					step: {
						type: 'search',
						query: searchInfo.query,
						resultCount: searchInfo.resultCount
					}
				});
			} else {
				// The router declined. Without this note nothing in the context tells the
				// model apart "I searched and found nothing" from "I never searched" —
				// and models fill that silence by claiming they looked it up, sometimes
				// staging fake searches in their reasoning first.
				//
				// Sent alongside the index below rather than instead of it: the two answer
				// different questions, one about this message and one about the ones before
				// it, which is exactly the distinction the model was failing to make.
				chatMessages = [
					{ role: 'system', content: resolvePrompt('searchNone', overrides) },
					...chatMessages
				];
			}
		}

		// The index of what earlier turns found, ahead of anything retrieved for this
		// message: oldest first, so "what you already knew" reads before "what you were
		// just handed", and the two lists of [numbers] can't be mistaken for each other.
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

		// Native mode: when to reach for a tool, as an instruction rather than as a
		// line in a tool description. The text path has a whole pre-pass whose only job
		// is deciding whether to look something up, and dropping that left the decision
		// resting on a description the model weighs far more lightly.
		if (nativeTools.length) {
			chatMessages = [
				...chatMessages,
				{ role: 'system', content: resolvePrompt('toolPolicy', overrides) }
			];
		}

		// Not in native mode, where `read_page` says all of this in its own description
		// and the model has a real call to make instead of a block to write.
		if (!native && mayReread && (sentSnippets || recalled.length)) {
			chatMessages = [
				...chatMessages,
				{ role: 'system', content: resolvePrompt('searchRead', overrides) }
			];
		}

		// Map messages for the chat request, converting images if necessary
		const chatMessagesForRequest = chatMessages.map((msg) => {
			// Ollama expects images as base64 strings without filename
			const images = msg.images?.map((img) => img.data);
			// An assistant turn that was only an <ask> block has empty content; some
			// providers (Mistral) reject that, so send the questions as text.
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

		/**
		 * Sources this turn has put in front of the model, in the order it saw them.
		 *
		 * Numbering runs across the whole turn rather than restarting per call: a model
		 * that searches twice and then cites [2] has to mean one thing. It is also what
		 * ends up stored on the message, and therefore what the next turn's index is
		 * built from.
		 */
		const turnSources: { title: string; url: string }[] = [];

		/** Addresses `read_page` will open: only what this conversation has shown. */
		const openable = () =>
			new Set([...recallableUrls(recalled), ...turnSources.map((s) => s.url), ...linkedUrls]);

		/**
		 * Run one call and return what the model should read as its result.
		 *
		 * Every failure comes back as text rather than as an exception. A tool that
		 * throws takes down a turn the user is waiting on; a tool that explains what
		 * went wrong lets the model apologise, try differently, or answer without it.
		 */
		const runToolCall = async (call: ToolCall): Promise<string> => {
			let args: Record<string, unknown>;
			try {
				args = JSON.parse(call.arguments || '{}');
			} catch {
				return 'Those arguments were not valid JSON, so the call was not made. Try again with a well-formed argument object, or answer without this tool.';
			}

			if (call.name === WEB_SEARCH_TOOL.name) {
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

			if (call.name === READ_PAGE_TOOL.name) {
				const url = typeof args.url === 'string' ? args.url.trim() : '';
				if (!url) return 'This call needs a non-empty "url" string.';
				// The same allowlist the `<read>` protocol resolves against: the model can
				// reopen what it was shown and nothing else, so no address it composes
				// turns into a request.
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

			return `There is no tool called "${call.name}".`;
		};

		// Two rounds for the text protocol: the model may answer the first with a
		// <read> block asking for the full text of some results, which is fetched
		// and handed back for the second. It never gets a third.
		//
		// Four when it has real tools, because it spends them one call at a time and
		// a search followed by a read is already two. Still a hard ceiling: a small
		// model that has decided to call the same tool forever costs the user a
		// bounded number of requests, and then owes an answer with what it has.
		const maxRounds = nativeTools.length ? 4 : 2;

		let completion = '';
		let reasoning = '';

		for (let round = 0; round < maxRounds; round++) {
			completion = '';
			reasoning = '';
			emit({ type: 'round', index: round });

			// The last round is the one that has to produce a reply, so the tools are
			// withdrawn for it. Declining the calls instead would leave the model's
			// final word being a request nobody answers, and the user with an empty
			// message; taking the tools away leaves it no choice but to write.
			if (nativeTools.length && round === maxRounds - 1) {
				chatRequest = {
					...chatRequest,
					tools: undefined,
					messages: [
						...chatRequest.messages,
						{
							role: 'system',
							content:
								'No further tool calls are possible for this message. Answer now with what you have, and say plainly what you were not able to check.'
						}
					]
				};
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
				// Native reasoning (Ollama `message.thinking`, OpenAI `reasoning_content`)
				// streams straight into the reasoning panel. Regular content still goes
				// through the FSM so inline <think> tags from other providers are split out.
				if (part.thinking) {
					reasoning += part.thinking;
					emit({ type: 'thinking', text: part.thinking });
				}
				if (part.content) reasoningProcessor.processChunk(part.content);
				if (part.toolCalls) toolCalls = part.toolCalls;
				// What the provider says it used. Summed across rounds, because a turn
				// that called a tool made more than one request and paid for each.
				if (part.usage) {
					used = {
						input: used.input + part.usage.input,
						output: used.output + part.usage.output
					};
				}
			});

			reasoningProcessor.finalize();

			// The native path. A turn ends when the model stops asking for tools, or
			// when it runs out of rounds — never on the tools failing, since a failure
			// is text it can read and answer around.
			if (nativeTools.length) {
				if (!toolCalls.length || signal.aborted) break;

				// Whatever it wrote alongside the calls belongs to the round that asked,
				// and the reply is written fresh next round. Kept in the timeline so the
				// thinking that led to the call is not lost off screen.
				if (reasoning.trim())
					emit({ type: 'trace', step: { type: 'reasoning', content: reasoning } });

				// Sequentially, not in parallel: each call numbers its sources from what
				// the turn has already collected, so two searches resolved at once would
				// both start from the same number and the model's citations would point
				// at two different pages. It also lets a read follow a search that only
				// just produced the address.
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

			// Numbers address this turn's results; addresses reach anything the
			// conversation was shown, which is how the model rereads a page from three
			// messages ago instead of taking back what it said then. Both resolve
			// against what we handed it: an address it invented matches nothing and is
			// dropped, so no reply of its own can send a request somewhere new.
			const allowed = recallableUrls(recalled);

			// What a number means. This turn's results first, then the index of what
			// earlier turns found, which keeps the numbers the answers citing it used.
			const byNumber: Record<number, string> = {};
			for (const search of recalled) {
				for (const source of search.sources) byNumber[source.number] = source.url;
			}
			sources.forEach((source, i) => (byNumber[i + 1] = source.url));

			// Deduplicated: a model that asks for both `1` and its address means one page.
			// Nothing resolves when the user has the web tools off, which is the same
			// gate as the offer above: a block emitted unprompted fetches nothing.
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

			// It asked for something, and none of it resolved. Breaking here used to
			// end the turn on whatever was left of the reply, which for a model that
			// wrote nothing but the request block is nothing at all: the user got an
			// empty message. Tell it, and let it answer.
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

			// From here the turn takes a second round, which overwrites the live
			// reasoning: this round's thinking joins the timeline as a step, in the
			// same position it already occupied, so nothing moves on screen.
			if (reasoning.trim())
				emit({ type: 'trace', step: { type: 'reasoning', content: reasoning } });

			emit({ type: 'searching', active: true, activity: 'read' });
			let read: ReadOutcome | null = null;
			try {
				read = await deps.readPages(urls);
			} catch {
				// Unreachable pages shouldn't cost the user their answer: fall through
				// and let the model reply from the snippets it already has.
			}
			emit({ type: 'searching', active: false });
			emit({
				type: 'trace',
				step: { type: 'read', pages: read?.pages.map((p) => ({ ...p })) ?? [] }
			});

			// It asked and got nothing: say so, rather than let it answer from the
			// one-line snippets as though it had read the pages.
			if (!read) {
				chatRequest = {
					...chatRequest,
					messages: [
						...chatRequest.messages,
						{
							role: 'system',
							content:
								'The pages you asked to read could not be retrieved. Answer from the search snippets alone, and say plainly that you could not open the pages — do not present their contents as if you had read them.'
						}
					]
				};
				continue;
			}

			// Not necessarily a search that happened this turn: a page can now be
			// reopened off the index alone, so there may be no query behind it.
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

		// Pull out an <ask> quick-choice block, if the model emitted one. The
		// stored content drops the raw block (buttons render from `choices`).
		const { content, choices } = parseAskBlock(stripReadBlock(completion));

		const message: Message = {
			role: 'assistant',
			content,
			reasoning,
			webSearch: searchInfo,
			choices,
			createdAt: new Date().toISOString(),
			// Who said it. Absent on an ordinary turn, which is every turn the app had
			// before a persona could be called into one.
			personaId: input.speaker?.personaId,
			personaName: input.speaker?.name
		};

		emit({ type: 'message', message });

		// Naming and compaction are part of the turn rather than something the page
		// does afterwards. Left to the page, they died with it exactly as the answer
		// did: a conversation whose first reply landed while the tab was closed came
		// back untitled and uncompacted, which is the same defect wearing a hat.
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

		// Last, so a client that is counting has the whole turn rather than a round
		// of it. Emitted even at zero: the difference between "nothing reported" and
		// "nothing spent" belongs to whoever reads it.
		emit({ type: 'usage', used });
		emit({ type: 'done' });
	} catch (error) {
		const typed = error instanceof Error ? error : new Error(String(error));
		const aborted = typed.name === 'AbortError' || signal.aborted;
		emit({ type: 'error', message: typed.message, aborted });
	}
}
