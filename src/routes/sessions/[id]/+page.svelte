<script lang="ts">
	import { ArrowDown, Settings2 } from '@lucide/svelte';
	import { onMount, tick, untrack } from 'svelte';
	import { toast } from 'svelte-sonner';
	import { get } from 'svelte/store';
	import { fly } from 'svelte/transition';

	import LL from '$i18n/i18n-svelte';
	import { beforeNavigate } from '$app/navigation';
	import { page } from '$app/state';
	import { askChoicesToText, formatAskAnswer, parseAskBlock } from '$lib/askChoice';
	import { type ChatRequest, type ChatStrategy } from '$lib/chat';
	import { OllamaStrategy } from '$lib/chat/ollama';
	import { OpenAIStrategy } from '$lib/chat/openai';
	import { generateTitle } from '$lib/chat/title';
	import { chatDefaultsConfig } from '$lib/chatDefaults';
	import Button from '$lib/components/Button.svelte';
	import ButtonDelete from '$lib/components/ButtonDelete.svelte';
	import Head from '$lib/components/Head.svelte';
	import Header from '$lib/components/Header.svelte';
	import ModelSelect from '$lib/components/ModelSelect.svelte';
	import PersonaAvatar from '$lib/components/PersonaAvatar.svelte';
	import { ConnectionType } from '$lib/connections';
	import { formatCurrentDateTime } from '$lib/currentDate';
	import { resolvePrompt } from '$lib/defaultPrompts';
	import { personasStore, serversStore, settingsStore } from '$lib/localStorage';
	import {
		imagesPayload,
		knowledgeContextMessage,
		type KnowledgeAttachment
	} from '$lib/promptAttachments';
	import { parseReadBlock, stripReadBlock } from '$lib/readProtocol';
	import { buildSearchContext, searchConfig } from '$lib/search';
	import {
		getSessionTitle,
		loadSession,
		saveSession,
		type Editor,
		type Message,
		type WebSearchInfo
	} from '$lib/sessions';
	import { Sitemap } from '$lib/sitemap';
	import { pendingMessage } from '$lib/stores/pendingMessage';
	import { effectiveSystemPrompt, systemPromptsConfig } from '$lib/systemPrompts';
	import { formatTimestampToNow } from '$lib/utils';
	import { buildPageContext, extractUrls, webFetchConfig } from '$lib/webFetch';

	import type { PageData } from './$types';
	import ButtonCopyConversation from './ButtonCopyConversation.svelte';
	import Controls from './Controls.svelte';
	import Messages from './Messages.svelte';
	import Prompt from './Prompt.svelte';
	import { createReasoningProcessor } from './reasoningProcessor';
	import SessionModal from './SessionModal.svelte';

	interface Props {
		data: PageData;
	}

	let { data }: Props = $props();

	const searchAvailable = $derived($searchConfig.available);

	// svelte-ignore state_referenced_locally
	let session = $state(loadSession(data.id));
	// svelte-ignore state_referenced_locally
	let editor = $state<Editor>({
		prompt: '',
		view: 'messages',
		messageIndexToEdit: null,
		isExpanded: false,
		isCompletionInProgress: false,
		shouldFocusTextarea: false,
		isNewSession: true,
		webSearch: searchAvailable && $settingsStore.webSearchByDefault,
		webFetch: $webFetchConfig.available && $settingsStore.webFetchByDefault,
		interactiveChoices: $settingsStore.interactiveChoices,
		sendCurrentDate: $settingsStore.sendCurrentDate,
		thinking: true
	});
	let messagesWindow: HTMLDivElement | undefined = $state();
	let modelName: string | undefined = $state();
	let userScrolledUp = $state(false);
	let shouldConfirmDeletion = $state(false);

	// The chat composer floats over the message list (translucent + blur). We reserve
	// matching bottom space in the scroll area so the last message clears it. Only the
	// plain chat view floats; controls and the expanded code editor stay in flow.
	let promptHeight = $state(0);
	const composerFloating = $derived(editor.view === 'messages' && !editor.isExpanded);

	// The persona this conversation belongs to, if any (drives the header identity).
	const persona = $derived(
		session.personaId ? $personasStore.find((p) => p.id === session.personaId) : undefined
	);

	// Empty until the conversation has a real title (or a first user message to
	// derive one from) — the header falls back to "Session #id" until then.
	const sessionTitle = $derived(editor.isNewSession ? '' : getSessionTitle(session));

	$effect(() => {
		if (data.id !== session.id) handleSessionChange();
	});

	$effect(() => {
		session.model = $settingsStore.models.find((m) => m.name === modelName);
	});

	let sessionModalOpen = $state(false);

	// Tracks the last system prompt we auto-resolved, so a model switch can update
	// it — but we never overwrite a hand-edited or knowledge-based prompt.
	let lastAutoSystemPrompt = '';

	function maybeAutoResolveSystemPrompt() {
		if (session.systemPromptEdited) return;
		if (session.messages.some((m) => m.role === 'assistant')) return; // conversation already started
		const current = session.systemPrompt.content;
		if (current && current !== lastAutoSystemPrompt) return; // manual / knowledge content — leave it
		const resolved = effectiveSystemPrompt(modelName, $systemPromptsConfig.prompts);
		if (resolved === current) return;
		session.systemPrompt = { ...session.systemPrompt, content: resolved };
		lastAutoSystemPrompt = resolved;
	}

	// Re-resolve the system prompt when the model changes (new/unedited sessions).
	$effect(() => {
		void modelName;
		untrack(() => maybeAutoResolveSystemPrompt());
	});

	$effect(() => {
		if (editor.shouldFocusTextarea && editor.promptTextarea) {
			editor.promptTextarea.focus();
			editor.shouldFocusTextarea = false;
		}
	});

	onMount(async () => {
		handleSessionChange();
		await scrollToBottom();
		messagesWindow?.addEventListener('scroll', handleScroll);
	});

	beforeNavigate((navigation) => {
		if (editor.isCompletionInProgress) {
			const userConfirmed = confirm($LL.areYouSureYouWantToLeave());
			if (userConfirmed) {
				stopCompletion();
				return;
			}
			navigation.cancel();
			return;
		}

		// Only show confirmation when navigating outside of /sessions/ path
		if (
			editor.prompt &&
			editor.prompt.trim() !== '' &&
			!navigation.to?.url.pathname.startsWith('/sessions/')
		) {
			const userConfirmed = confirm($LL.unsavedChangesWillBeLost());
			if (!userConfirmed) {
				navigation.cancel();
			}
		}
	});

	async function handleSessionChange() {
		session = loadSession(data.id);
		modelName = session.model?.name || '';
		editor.view = 'messages';
		editor.isNewSession = !session?.messages?.length;
		editor.interactiveChoices = $settingsStore.interactiveChoices;
		editor.sendCurrentDate = $settingsStore.sendCurrentDate;
		editor.thinking = true;
		scrollToBottom();

		// A persona conversation carries its own web-search preference.
		const boundPersona = session.personaId
			? get(personasStore).find((p) => p.id === session.personaId)
			: null;
		if (boundPersona) {
			editor.webSearch = searchAvailable && !!boundPersona.webSearch;
			// Heal the model if it wasn't resolvable when the conversation was created
			// (e.g. an imported persona whose model was mapped afterwards).
			if (!session.model && boundPersona.modelName) modelName = boundPersona.modelName;
		}

		// A message composed on the home page (prompt + model + attachments) is
		// handed off via the pendingMessage store, then submitted here.
		const pending = get(pendingMessage);
		if (pending) {
			pendingMessage.set(null);
			editor.prompt = pending.prompt;
			editor.isNewSession = false;

			if (pending.model) {
				modelName = pending.model;
				const model = $settingsStore.models.find((m) => m.name === pending.model);
				if (model) session.model = model;
			}

			editor.webSearch = pending.webSearch;
			// Carry over the composer tool switches set on the home page (undefined →
			// keep the session defaults already assigned above).
			if (pending.thinking !== undefined) editor.thinking = pending.thinking;
			if (pending.interactiveChoices !== undefined)
				editor.interactiveChoices = pending.interactiveChoices;
			if (pending.sendCurrentDate !== undefined) editor.sendCurrentDate = pending.sendCurrentDate;

			const knowledgeMessages = pending.attachments
				.filter((a): a is KnowledgeAttachment => a.type === 'knowledge' && !!a.knowledge)
				.map((a) => knowledgeContextMessage(a.knowledge!));
			if (knowledgeMessages.length) {
				session.messages = [...session.messages, ...knowledgeMessages];
			}

			const images = imagesPayload(pending.attachments);
			await tick();
			handleSubmit(images.length ? images : undefined);
			return;
		}

		const promptParam = page.url.searchParams.get('q');
		if (promptParam) {
			editor.prompt = promptParam;
			editor.isNewSession = false;

			const modelParam = page.url.searchParams.get('model');
			if (modelParam) {
				modelName = modelParam;
				const model = $settingsStore.models.find((m) => m.name === modelParam);
				if (model) session.model = model;
			}

			if (page.url.searchParams.get('search') === '1') editor.webSearch = true;

			// Strip the one-shot params so a refresh doesn't re-submit the prompt
			// (and doesn't repopulate the input with already-sent text).
			const cleaned = new URL(page.url);
			cleaned.searchParams.delete('q');
			cleaned.searchParams.delete('model');
			cleaned.searchParams.delete('search');
			history.replaceState(history.state, '', cleaned);

			await tick();
			handleSubmit();
		}
	}

	async function handleSubmitNewMessage(images?: { data: string; filename: string }[]) {
		const message: Message = {
			role: 'user',
			content: editor.prompt,
			createdAt: new Date().toISOString()
		};
		if (images && images.length) message.images = images;
		session.messages = [...session.messages, message];
		await scrollToBottom(true); // Force scroll after submitting prompt
		await handleCompletion(session.messages);
	}

	async function handleSubmitEditMessage(images?: { data: string; filename: string }[]) {
		if (editor.messageIndexToEdit === null) return;

		const msg = session.messages[editor.messageIndexToEdit];
		msg.content = editor.prompt;
		if (images) {
			msg.images = images;
		} else {
			delete msg.images;
		}

		// Remove all messages after the edited message
		session.messages = session.messages.slice(0, editor.messageIndexToEdit + 1);

		editor.messageIndexToEdit = null;
		editor.prompt = '';

		await handleCompletion(session.messages);
	}

	function handleSubmit(images?: { data: string; filename: string }[]) {
		if (!editor.prompt && (!images || images.length === 0)) return;
		if (!session.model) return;
		editor.isExpanded = false;
		editor.isNewSession = false;
		editor.view = 'messages';

		if (editor.messageIndexToEdit !== null) handleSubmitEditMessage(images);
		else handleSubmitNewMessage(images);
	}

	// A quick-choice selection becomes a normal user message (no tool_result).
	function handleChoose(text: string) {
		if (!text || editor.isCompletionInProgress) return;
		editor.prompt = text;
		handleSubmit();
	}

	// Lock the picked option(s) onto the message (so reload renders them) and send
	// the selection as a normal user message. Shared by the inline bubble and the
	// docked panel above the composer.
	function chooseAnswer(message: Message, selected: string[][]) {
		if (!message.choices || message.choices.answered) return;
		const text = formatAskAnswer(message.choices.questions, selected);
		if (!text) return;
		message.choices = { ...message.choices, answered: true, selected };
		saveSession(session);
		handleChoose(text);
	}

	// The unanswered quick-choice awaiting input — shown docked above the composer
	// (Claude-style) instead of inline, and skipped in the message list until answered.
	const pendingChoice = $derived.by(() => {
		if (editor.isCompletionInProgress) return null;
		const last = session.messages.at(-1);
		return last?.role === 'assistant' && last.choices && !last.choices.answered ? last : null;
	});

	async function handleRetry(index: number) {
		// Remove all the messages after the index
		session.messages = session.messages.slice(0, index);

		const mostRecentUserMessage = session.messages.filter((m) => m.role === 'user').at(-1);
		if (!mostRecentUserMessage) throw new Error('No user message to retry');

		await handleCompletion(session.messages);
	}

	async function handleCompletion(messages: Message[]) {
		editor.abortController = new AbortController();
		editor.isCompletionInProgress = true;
		editor.prompt = '';
		editor.completion = '';
		editor.reasoning = '';
		editor.streamingReasoningExpanded = false;
		editor.isSearching = false;
		editor.searchQuery = undefined;
		editor.webSearchInfo = undefined;

		const server = $serversStore.find((s) => s.id === session.model?.serverId);
		if (!server) throw new Error('Server not found');
		if (!session.model?.name) throw new Error('No model');

		let chatMessages = session.systemPrompt.content
			? [session.systemPrompt, ...messages]
			: messages;

		// Interactive quick-choice buttons: teach the model the <ask> protocol.
		if (editor.interactiveChoices) {
			const content = resolvePrompt('interactiveChoices', $settingsStore.promptOverrides);
			chatMessages = [{ role: 'system', content }, ...chatMessages];
		}

		// Anchor the model in real time so it doesn't fall back on its training-cutoff
		// sense of "now" (and reject facts that postdate it). Led first in the context.
		if (editor.sendCurrentDate) {
			const content = resolvePrompt('currentDate', $settingsStore.promptOverrides, {
				datetime: formatCurrentDateTime()
			});
			chatMessages = [{ role: 'system', content }, ...chatMessages];
		}

		let searchInfo: WebSearchInfo | undefined;

		// Pages the user linked to are read in full, and take precedence over a
		// search: given an address, looking it up by keyword is the wrong move —
		// the model would answer from snippets about the page instead of the page.
		const linkedUrls = editor.webFetch
			? extractUrls(messages.filter((m) => m.role === 'user').at(-1)?.content ?? '')
			: [];

		if (linkedUrls.length && $webFetchConfig.available) {
			editor.isSearching = true;
			try {
				const read = await buildPageContext(linkedUrls);
				if (read) {
					chatMessages = [
						{
							role: 'system',
							content: resolvePrompt('pageContext', $settingsStore.promptOverrides, {
								pages: read.context
							})
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
			editor.isSearching = false;
			editor.webSearchInfo = searchInfo;
		}

		// Web search: prepend results as context. In "auto" mode the model first
		// decides whether (and what) to search; otherwise we always search the
		// latest message.
		if (!linkedUrls.length && searchAvailable && editor.webSearch && session.model) {
			const lastUserMessage = messages.filter((m) => m.role === 'user').at(-1);
			let query: string | null = lastUserMessage?.content ?? null;

			// In auto mode the model first decides whether (and what) to search. This
			// phase is transparent (no indicator): if it replies NONE we skip the
			// search entirely and nothing is shown.
			if (query && $settingsStore.webSearchAuto) {
				const decider =
					server.connectionType === ConnectionType.Ollama
						? new OllamaStrategy(server)
						: new OpenAIStrategy(server);

				// The query writer: decides whether to search and reformulates a neutral,
				// date-anchored query (query rewriting). Fed only the recent turns — not
				// the session system prompt, which would bias it toward chatting. Run at
				// temperature 0 for determinism. Editable in Settings → Tools.
				const routerInstruction = resolvePrompt('searchRouter', $settingsStore.promptOverrides, {
					datetime: formatCurrentDateTime()
				});

				const recentTurns = messages
					.filter((m) => m.role === 'user' || m.role === 'assistant')
					.slice(-6)
					.map((m) => ({
						role: m.role,
						content:
							m.role === 'assistant' && !m.content?.trim() && m.choices
								? askChoicesToText(m.choices)
								: m.content
					}));

				try {
					let decision = (
						await decider.complete?.({
							model: session.model.name,
							options: { temperature: 0 },
							messages: [{ role: 'system' as const, content: routerInstruction }, ...recentTurns]
						})
					)?.trim();
					// Keep only the first line and strip any surrounding quotes.
					if (decision)
						decision = decision
							.split('\n')[0]
							.trim()
							.replace(/^["']+|["']+$/g, '');
					query = decision && !/^none\b/i.test(decision) ? decision : null;
				} catch {
					// Router failed — fall back to searching the raw user message.
				}
			}

			if (query) {
				// In auto mode the query is a concise model-written reformulation worth
				// showing; in explicit mode it's the raw (often long) user message, so hide it.
				if ($settingsStore.webSearchAuto) editor.searchQuery = query;
				editor.isSearching = true;
				try {
					const search = await buildSearchContext(query);
					if (search) {
						// The protocol is only advertised when the tool that serves it is
						// available: promising the model a page it can't be given is worse
						// than snippets alone.
						const context = $webFetchConfig.available
							? `${search.context}\n\n${resolvePrompt('searchRead', $settingsStore.promptOverrides)}`
							: search.context;
						chatMessages = [{ role: 'system', content: context }, ...chatMessages];
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
				editor.isSearching = false;
				editor.webSearchInfo = searchInfo;
			}
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
			return {
				...msg,
				content,
				images // Override images with just the data
			};
		});

		let chatRequest: ChatRequest = {
			model: session.model.name,
			options: session.options,
			messages: chatMessagesForRequest,
			think: editor.thinking !== false
		};

		try {
			let strategy: ChatStrategy | undefined = undefined;
			switch (server.connectionType) {
				case ConnectionType.Ollama:
					strategy = new OllamaStrategy(server);
					break;
				case ConnectionType.OpenAI:
				case ConnectionType.OpenAICompatible:
				case ConnectionType.Anthropic:
				case ConnectionType.Infomaniak:
					strategy = new OpenAIStrategy(server);
					break;
			}

			if (!strategy) throw new Error('Invalid strategy');

			// Two rounds at most: the model may answer the first with a <read> block
			// asking for the full text of some results, which is fetched and handed
			// back for the second. It never gets a third — an answer is due by then.
			for (let round = 0; round < 2; round++) {
				editor.completion = '';
				editor.reasoning = '';

				// Create a reasoning processor to handle tag parsing
				const reasoningProcessor = createReasoningProcessor(
					(text) => {
						editor.completion += text;
					},
					(text) => {
						editor.reasoning += text;
					}
				);

				await strategy.chat(chatRequest, editor.abortController.signal, async (part) => {
					// Native reasoning (Ollama `message.thinking`, OpenAI `reasoning_content`)
					// streams straight into the reasoning panel. Regular content still goes
					// through the FSM so inline <think> tags from other providers are split out.
					if (part.thinking) editor.reasoning += part.thinking;
					if (part.content) reasoningProcessor.processChunk(part.content);
					await scrollToBottom();
				});

				// Finalize processing of any remaining content
				reasoningProcessor.finalize();

				if (round > 0) break;
				const wanted = parseReadBlock(editor.completion);
				const sources = searchInfo?.sources ?? [];
				if (!wanted.length || !sources.length || !$webFetchConfig.available) break;

				const urls = wanted.map((n) => sources[n - 1]?.url).filter((url): url is string => !!url);
				if (!urls.length) break;

				editor.isSearching = true;
				let read: Awaited<ReturnType<typeof buildPageContext>> = null;
				try {
					read = await buildPageContext(urls);
				} catch {
					// Unreachable pages shouldn't cost the user their answer: fall through
					// and let the model reply from the snippets it already has.
				}
				editor.isSearching = false;
				if (!read) break;

				searchInfo = {
					...searchInfo!,
					sources: read.pages.map((page) => ({ title: page.title, url: page.url }))
				};
				editor.webSearchInfo = searchInfo;
				chatRequest = {
					...chatRequest,
					messages: [
						...chatRequest.messages,
						{
							role: 'system',
							content: resolvePrompt('pageContext', $settingsStore.promptOverrides, {
								pages: read.context
							})
						}
					]
				};
			}

			// Pull out an <ask> quick-choice block, if the model emitted one. The
			// stored content drops the raw block (buttons render from `choices`).
			const { content, choices } = parseAskBlock(stripReadBlock(editor.completion));

			const message: Message = {
				role: 'assistant',
				content,
				reasoning: editor.reasoning,
				webSearch: searchInfo,
				choices,
				// Stamped BEFORE the message is appended so the completed Article mounts
				// with the panel already in the right state — no post-render re-open flash.
				isReasoningVisible: !!(editor.streamingReasoningExpanded && editor.reasoning),
				createdAt: new Date().toISOString()
			};

			session.messages = [...session.messages, message];
			session.updatedAt = new Date().toISOString();
			saveSession(session);

			editor.completion = '';
			editor.reasoning = '';
			editor.shouldFocusTextarea = true;
			editor.isCompletionInProgress = false;
			await scrollToBottom();

			await maybeGenerateTitle();
		} catch (error) {
			const typedError = error instanceof Error ? error : new Error(String(error));
			if (typedError.name === 'AbortError') return; // User aborted the request
			handleError(typedError);
		}
	}

	async function maybeGenerateTitle() {
		// Auto-name a brand new session once its first exchange completes.
		const isFirstExchange = session.messages.filter((m) => m.role === 'assistant').length === 1;
		if (!$chatDefaultsConfig.title.generateTitlesWithAI || session.title || !isFirstExchange)
			return;

		const firstUserMessage = session.messages.find(
			(m) => m.role === 'user' && m.content && !m.knowledge
		);
		if (!firstUserMessage?.content) return;

		const title = await generateTitle(firstUserMessage.content);
		if (title) {
			session.title = title;
			session.updatedAt = new Date().toISOString();
			saveSession(session);
		}
	}

	function stopCompletion() {
		editor.abortController?.abort();

		// Add the incomplete message to session if there's any content
		if (editor.completion || editor.reasoning) {
			const message: Message = {
				role: 'assistant',
				content: editor.completion || '',
				reasoning: editor.reasoning || '',
				isReasoningVisible: !!(editor.streamingReasoningExpanded && editor.reasoning),
				createdAt: new Date().toISOString()
			};
			session.messages = [...session.messages, message];
			session.updatedAt = new Date().toISOString();
			saveSession(session);
		}

		// Clear editor state
		editor.completion = '';
		editor.reasoning = '';
		editor.isCompletionInProgress = false;
		editor.shouldFocusTextarea = true;
	}

	function handleError(error: Error) {
		if (error.message === 'Failed to fetch') {
			toast.error($LL.genericError(), { description: $LL.cantConnectToOllamaServer() });
		} else {
			toast.error($LL.genericError(), { description: error.toString() });
		}

		// For errors, restore the prompt so user can retry
		const lastUserMessage = session.messages.filter((m) => m.role === 'user').at(-1);
		if (lastUserMessage) {
			editor.prompt = lastUserMessage.content;
		}

		editor.abortController?.abort();
		editor.completion = '';
		editor.reasoning = '';
		editor.isCompletionInProgress = false;
		editor.shouldFocusTextarea = true;
	}

	/**
	 * "Near enough to the bottom" needs slack: an exact comparison flips to
	 * `userScrolledUp` on a single pixel of sub-pixel rounding — which happens
	 * constantly while streamed content grows — and auto-follow silently stops.
	 */
	const SCROLL_BOTTOM_THRESHOLD = 32;

	function handleScroll() {
		if (!messagesWindow) return;
		const { scrollTop, scrollHeight, clientHeight } = messagesWindow;
		userScrolledUp = scrollTop + clientHeight < scrollHeight - SCROLL_BOTTOM_THRESHOLD;
	}

	/**
	 * `smooth` is for the deliberate jump back (the button): the animation shows
	 * how far you travelled. Auto-follow during streaming stays instant — animating
	 * a scroll that retriggers on every token would never settle.
	 */
	async function scrollToBottom(shouldForceScroll = false, smooth = false) {
		if (!shouldForceScroll && (!messagesWindow || userScrolledUp)) return;
		await tick();
		requestAnimationFrame(() => {
			if (!messagesWindow) return;
			messagesWindow.scrollTo({
				top: messagesWindow.scrollHeight,
				behavior: smooth ? 'smooth' : 'auto'
			});
		});
	}
</script>

<div class="session relative flex h-full w-full flex-col overflow-hidden">
	<Head
		title={[editor.isNewSession ? $LL.newSession() : getSessionTitle(session), $LL.sessions()]}
	/>
	<Header confirmDeletion={shouldConfirmDeletion}>
		{#snippet headline()}
			{#if persona}
				<!-- Persona identity, laid out like the classic title/meta pair: avatar + name,
				     tagline as the muted second line. -->
				<div class="flex min-w-0 items-center gap-2.5" title={persona.tagline}>
					<PersonaAvatar {persona} size={32} />
					<div class="flex min-w-0 flex-col gap-0.5">
						<p class="truncate text-sm font-bold leading-tight text-active">{persona.name}</p>
						{#if persona.tagline}
							<p class="truncate text-xs leading-tight text-muted">{persona.tagline}</p>
						{/if}
					</div>
				</div>
			{:else}
				<!-- Once a conversation has a title it becomes the headline, with the id
				     kept as a parenthesised link so it stays copyable/navigable. -->
				<!-- leading-tight, not leading-none: `truncate` hides overflow, so a line box
				     the exact height of the font clips descenders. -->
				<p data-testid="session-id" class="truncate font-bold leading-tight">
					{#if sessionTitle}
						{sessionTitle}
						<span class="text-muted">
							(<Button variant="link" href={`/sessions/${session.id}`}>#{session.id}</Button>)
						</span>
					{:else}
						{$LL.session()}
						<Button variant="link" href={`/sessions/${session.id}`}>#{session.id}</Button>
					{/if}
				</p>
				<div class="flex items-center gap-1.5 text-xs text-muted">
					{editor.isNewSession ? $LL.newSession() : formatTimestampToNow(session.updatedAt ?? '')}
				</div>
			{/if}
		{/snippet}

		{#snippet nav()}
			{#if !persona}
				<!-- Model + settings as one control: the model belongs to this conversation's
				     configuration, so it sits with the button that opens it. Keeping it out
				     of the headline also leaves the title its full height. On mobile only the
				     settings half shows — the model is changed from inside the panel.
				     The border lives on the group rather than on each half, so focusing (or
				     opening) the picker rings the whole control instead of stopping mid-way. -->
				<div
					class="mr-1 flex items-center overflow-hidden rounded-md border border-shade-3 transition-colors focus-within:border-accent has-[[data-state=open]]:border-accent"
				>
					<span class="hidden lg:flex">
						<ModelSelect bind:value={modelName} variant="attached" />
					</span>
					<!-- Transparent on the header's own background: the control is chrome, not
					     content, so it only lifts on hover. -->
					<button
						type="button"
						class="flex h-8 items-center justify-center bg-transparent px-2 text-muted transition-colors hover:bg-shade-2 hover:text-active"
						onclick={() => (sessionModalOpen = true)}
						title={$LL.session()}
						aria-label={$LL.session()}
					>
						<Settings2 class="base-icon" />
					</button>
				</div>
			{/if}
			{#if !editor.isNewSession}
				{#if !shouldConfirmDeletion}
					<ButtonCopyConversation {session} assistantLabel={persona?.name} />
				{/if}
				<ButtonDelete sitemap={Sitemap.SESSIONS} id={session.id} bind:shouldConfirmDeletion />
			{/if}
		{/snippet}
	</Header>

	{#if editor.view === 'controls'}
		<Controls bind:session />
	{:else}
		<div
			class="session__history base-fieldset-container overflow-scrollbar flex-grow"
			style={composerFloating ? `padding-bottom: ${promptHeight + 16}px` : undefined}
			bind:this={messagesWindow}
		>
			<Messages
				bind:session
				bind:editor
				{handleRetry}
				{chooseAnswer}
				{pendingChoice}
				assistantLabel={persona?.name}
			/>
		</div>

		<!-- Scrolling up during a reply silently opts you out of auto-follow; without
		     this there is nothing to say content is still arriving below, nor any way
		     back short of dragging. Sits above the composer, which floats over the
		     history. -->
		{#if userScrolledUp}
			<button
				type="button"
				transition:fly={{ y: 8, duration: 150 }}
				onclick={() => scrollToBottom(true, true)}
				aria-label={$LL.scrollToBottom()}
				title={$LL.scrollToBottom()}
				style={composerFloating ? `bottom: ${promptHeight + 16}px` : undefined}
				class="scroll-to-bottom absolute bottom-4 left-1/2 z-20 flex h-9 w-9 -translate-x-1/2 items-center justify-center rounded-full border border-shade-3 bg-shade-0 text-muted shadow-md transition-colors hover:text-active"
			>
				<ArrowDown class="base-icon" />
			</button>
		{/if}
	{/if}

	<div
		class={composerFloating ? 'pointer-events-none absolute inset-x-0 bottom-0 z-10' : ''}
		bind:clientHeight={promptHeight}
	>
		<Prompt
			bind:session
			bind:editor
			{handleSubmit}
			{stopCompletion}
			{scrollToBottom}
			{pendingChoice}
			{chooseAnswer}
		/>
	</div>
</div>

<SessionModal bind:open={sessionModalOpen} bind:session bind:modelName />
