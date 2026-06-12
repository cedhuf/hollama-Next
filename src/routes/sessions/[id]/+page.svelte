<script lang="ts">
	import { Settings2 } from '@lucide/svelte';
	import { onMount, tick, untrack } from 'svelte';
	import { toast } from 'svelte-sonner';
	import { get } from 'svelte/store';

	import LL from '$i18n/i18n-svelte';
	import { beforeNavigate } from '$app/navigation';
	import { page } from '$app/state';
	import { type ChatRequest, type ChatStrategy } from '$lib/chat';
	import { OllamaStrategy } from '$lib/chat/ollama';
	import { OpenAIStrategy } from '$lib/chat/openai';
	import { generateTitle } from '$lib/chat/title';
	import { chatDefaultsConfig } from '$lib/chatDefaults';
	import Button from '$lib/components/Button.svelte';
	import ButtonCopy from '$lib/components/ButtonCopy.svelte';
	import ButtonDelete from '$lib/components/ButtonDelete.svelte';
	import Head from '$lib/components/Head.svelte';
	import Header from '$lib/components/Header.svelte';
	import ModelPicker from '$lib/components/ModelPicker.svelte';
	import PersonaAvatar from '$lib/components/PersonaAvatar.svelte';
	import { ConnectionType } from '$lib/connections';
	import { personasStore, serversStore, settingsStore } from '$lib/localStorage';
	import {
		imagesPayload,
		knowledgeContextMessage,
		type KnowledgeAttachment
	} from '$lib/promptAttachments';
	import { buildSearchContext, searchConfig } from '$lib/search';
	import {
		getSessionTitle,
		loadSession,
		saveSession,
		type Editor,
		type Message
	} from '$lib/sessions';
	import { Sitemap } from '$lib/sitemap';
	import { pendingMessage } from '$lib/stores/pendingMessage';
	import { effectiveSystemPrompt, systemPromptsConfig } from '$lib/systemPrompts';
	import { formatTimestampToNow } from '$lib/utils';

	import type { PageData } from './$types';
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
		isCodeEditor: false,
		isCompletionInProgress: false,
		shouldFocusTextarea: false,
		isNewSession: true,
		webSearch: searchAvailable && $settingsStore.webSearchByDefault
	});
	let messagesWindow: HTMLDivElement | undefined = $state();
	let modelName: string | undefined = $state();
	let userScrolledUp = $state(false);
	let shouldConfirmDeletion = $state(false);

	// The persona this conversation belongs to, if any (drives the header identity).
	const persona = $derived(
		session.personaId ? $personasStore.find((p) => p.id === session.personaId) : undefined
	);

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
		const message: Message = { role: 'user', content: editor.prompt };
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
		editor.isCodeEditor = false;
		editor.isNewSession = false;
		editor.view = 'messages';

		if (editor.messageIndexToEdit !== null) handleSubmitEditMessage(images);
		else handleSubmitNewMessage(images);
	}

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
		editor.isSearching = false;
		editor.searchQuery = undefined;
		editor.webSearchInfo = undefined;

		const server = $serversStore.find((s) => s.id === session.model?.serverId);
		if (!server) throw new Error('Server not found');
		if (!session.model?.name) throw new Error('No model');

		let chatMessages = session.systemPrompt.content
			? [session.systemPrompt, ...messages]
			: messages;

		let searchInfo: { query: string; resultCount: number } | undefined;

		// Web search: prepend results as context. In "auto" mode the model first
		// decides whether (and what) to search; otherwise we always search the
		// latest message.
		if (searchAvailable && editor.webSearch && session.model) {
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

				// A focused, deterministic router prompt with only the recent turns
				// (NOT the session system prompt, which biases the model toward
				// chatting instead of deciding). Temperature 0 + few-shot examples
				// make weak models reliable — without them, models tend to "offer" to
				// search instead of just doing it on a direct question.
				const routerInstruction =
					"You are a web-search router. Look at the user's LAST message and decide whether answering it needs a live web lookup right now.\n\n" +
					"Reply with EITHER a short web search query (a few keywords, in the user's language, no quotes, nothing else) OR the single word NONE.\n\n" +
					'You MUST output a query (never NONE) when the message involves:\n' +
					'- weather, news, prices, stocks, sports scores, schedules, opening hours, traffic;\n' +
					'- anything tied to "today", "now", "current", "latest", "aujourd\'hui", "actualités", or a recent date;\n' +
					'- events, releases or facts that may have changed after your training data;\n' +
					'- or an explicit request to search / look something up online.\n\n' +
					'Reply NONE only for timeless requests you can fully answer from your own knowledge (definitions, explanations, math, translation, coding, writing, general how-to).\n\n' +
					'Examples:\n' +
					'"Quelle est la météo aujourd\'hui à Vichy ?" -> météo Vichy aujourd\'hui\n' +
					'"Les actualités du jour ?" -> actualités du jour France\n' +
					'"Qui a gagné le match hier soir ?" -> résultat match hier soir\n' +
					'"Cours de l\'action Tesla ?" -> cours action Tesla\n' +
					'"Explique-moi la photosynthèse" -> NONE\n' +
					'"Traduis bonjour en espagnol" -> NONE\n' +
					'"Écris un poème sur l\'automne" -> NONE\n\n' +
					'Never answer the question yourself. Output only the query, or NONE.';

				const recentTurns = messages
					.filter((m) => m.role === 'user' || m.role === 'assistant')
					.slice(-6)
					.map((m) => ({ role: m.role, content: m.content }));

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
						chatMessages = [{ role: 'system', content: search.context }, ...chatMessages];
						searchInfo = { query: search.query, resultCount: search.resultCount };
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
			return {
				...msg,
				images // Override images with just the data
			};
		});

		let chatRequest: ChatRequest = {
			model: session.model.name,
			options: session.options,
			messages: chatMessagesForRequest
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

			// Create a reasoning processor to handle tag parsing
			const reasoningProcessor = createReasoningProcessor(
				(text) => {
					editor.completion += text;
				},
				(text) => {
					editor.reasoning += text;
				}
			);

			await strategy.chat(chatRequest, editor.abortController.signal, async (chunk) => {
				// Process the chunk using the FSM-based processor
				reasoningProcessor.processChunk(chunk);
				await scrollToBottom();
			});

			// Finalize processing of any remaining content
			reasoningProcessor.finalize();

			const message: Message = {
				role: 'assistant',
				content: editor.completion,
				reasoning: editor.reasoning,
				webSearch: searchInfo
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
				reasoning: editor.reasoning || ''
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

	function handleScroll() {
		if (!messagesWindow) return;
		const { scrollTop, scrollHeight, clientHeight } = messagesWindow;
		userScrolledUp = scrollTop + clientHeight < scrollHeight;
	}

	async function scrollToBottom(shouldForceScroll = false) {
		if (!shouldForceScroll && (!messagesWindow || userScrolledUp)) return;
		await tick();
		requestAnimationFrame(() => {
			if (messagesWindow) messagesWindow.scrollTop = messagesWindow.scrollHeight;
		});
	}
</script>

<div class="session relative flex h-full w-full flex-col overflow-hidden">
	<Head
		title={[editor.isNewSession ? $LL.newSession() : getSessionTitle(session), $LL.sessions()]}
	/>
	<Header confirmDeletion={shouldConfirmDeletion} floating={!!persona}>
		{#snippet headline()}
			{#if persona}
				<div class="flex items-center gap-3" title={persona.tagline}>
					<PersonaAvatar {persona} size={48} />
					<p class="text-base font-bold leading-none text-active">{persona.name}</p>
				</div>
			{:else}
				<p data-testid="session-id" class="font-bold leading-none">
					{$LL.session()}
					<Button variant="link" href={`/sessions/${session.id}`}>#{session.id}</Button>
				</p>
				<div class="flex items-center gap-1.5 text-xs text-muted">
					{editor.isNewSession ? $LL.newSession() : formatTimestampToNow(session.updatedAt ?? '')}
					<span class="text-shade-5">•</span>
					<ModelPicker bind:value={modelName} />
				</div>
			{/if}
		{/snippet}

		{#snippet nav()}
			{#if !persona}
				<Button variant="icon" onclick={() => (sessionModalOpen = true)} title={$LL.session()}>
					<Settings2 class="base-icon" />
				</Button>
			{/if}
			{#if !editor.isNewSession}
				{#if !shouldConfirmDeletion}
					<ButtonCopy content={JSON.stringify(session.messages, null, 2)} />
				{/if}
				<ButtonDelete sitemap={Sitemap.SESSIONS} id={session.id} bind:shouldConfirmDeletion />
			{/if}
		{/snippet}
	</Header>

	{#if editor.view === 'controls'}
		<Controls bind:session />
	{:else}
		<div
			class="session__history base-fieldset-container overflow-scrollbar flex-grow {persona
				? 'pt-20'
				: ''}"
			bind:this={messagesWindow}
		>
			<Messages bind:session bind:editor {handleRetry} assistantLabel={persona?.name} />
		</div>
	{/if}

	<Prompt bind:session bind:editor {handleSubmit} {stopCompletion} {scrollToBottom} />
</div>

<SessionModal bind:open={sessionModalOpen} bind:session bind:modelName />
