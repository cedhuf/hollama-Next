<script lang="ts">
	import { ArrowDown, MoreHorizontal, Settings2 } from '@lucide/svelte';
	import { onMount, tick, untrack } from 'svelte';
	import { toast } from 'svelte-sonner';
	import { get } from 'svelte/store';
	import { fly } from 'svelte/transition';

	import LL from '$i18n/i18n-svelte';
	import { beforeNavigate } from '$app/navigation';
	import { page } from '$app/state';
	import { formatAskAnswer } from '$lib/askChoice';
	import type { CommandName } from '$lib/chat/commands';
	import { compactSession } from '$lib/chat/compact';
	import { contextUsage, messagesInContext } from '$lib/chat/context';
	import { isServerMode } from '$lib/chat/endpoint';
	import { mentionedPersonas } from '$lib/chat/mentions';
	import { applyRunEvent, type RunSurface } from '$lib/chat/run/apply';
	import {
		cancelRun,
		followRun,
		forgetRun,
		rememberedRun,
		rememberRun,
		runForSession,
		startRun
	} from '$lib/chat/run/client';
	import { runLocally } from '$lib/chat/run/local';
	import type { RunInput, RunSpeaker } from '$lib/chat/run/types';
	import { chatDefaultsConfig } from '$lib/chatDefaults';
	import Button from '$lib/components/Button.svelte';
	import ButtonDelete from '$lib/components/ButtonDelete.svelte';
	import Head from '$lib/components/Head.svelte';
	import Header from '$lib/components/Header.svelte';
	import Menu from '$lib/components/Menu.svelte';
	import ModelSelect from '$lib/components/ModelSelect.svelte';
	import PersonaAvatar from '$lib/components/PersonaAvatar.svelte';
	import SessionMenu from '$lib/components/SessionMenu.svelte';
	import { resolvePrompt } from '$lib/defaultPrompts';
	import { personasStore, serversStore, settingsStore } from '$lib/localStorage';
	import { languageInstruction } from '$lib/personas';
	import { contextMessages, imagesPayload } from '$lib/promptAttachments';
	import { searchConfig } from '$lib/search';
	import { resolveSessionTitle, saveSession, type Editor, type Message } from '$lib/sessions';
	import { Sitemap } from '$lib/sitemap';
	import { pendingMessage } from '$lib/stores/pendingMessage';
	import { effectiveSystemPrompt, systemPromptsConfig } from '$lib/systemPrompts';
	import { formatTimestampToNow, isTouchPrimary } from '$lib/utils';
	import { webFetchConfig } from '$lib/webFetch';

	import type { PageData } from './$types';
	import ButtonCopyConversation from './ButtonCopyConversation.svelte';
	import Controls from './Controls.svelte';
	import Messages from './Messages.svelte';
	import Prompt from './Prompt.svelte';
	import SessionModal from './SessionModal.svelte';

	interface Props {
		data: PageData;
	}

	let { data }: Props = $props();

	const searchAvailable = $derived($searchConfig.available);

	// svelte-ignore state_referenced_locally
	let session = $state(data.session);
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
	/**
	 * Where the composer is drawn: sticky at the foot of the conversation while you
	 * are reading it, in the column's own footer once the editor takes the screen.
	 */
	const floatingComposer = $derived(editor.view === 'messages' && !editor.isExpanded);

	/**
	 * The bar floats on the same terms, plus the setting.
	 *
	 * Reading a conversation is the only view where either of them has something to
	 * float over; with the editor or the controls filling the screen, both go back
	 * to being the column's edges.
	 */
	const floatingHeader = $derived($settingsStore.floatingChatHeader !== false && floatingComposer);

	let messagesWindow: HTMLDivElement | undefined = $state();
	let modelName: string | undefined = $state();
	let userScrolledUp = $state(false);
	let shouldConfirmDeletion = $state(false);

	// The chat composer floats over the message list (translucent + blur). We reserve
	// matching bottom space in the scroll area so the last message clears it. Only the
	// plain chat view floats; controls and the expanded code editor stay in flow.

	// The persona this conversation belongs to, if any (drives the header identity).
	const persona = $derived(
		session.personaId ? $personasStore.find((p) => p.id === session.personaId) : undefined
	);

	// Empty until the conversation has a real title (or a first user message to
	// derive one from) — the header falls back to "Session #id" until then.
	const sessionTitle = $derived(editor.isNewSession ? '' : resolveSessionTitle(session));

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

	// Taking focus back once an answer lands is a convenience with a mouse and a
	// nuisance with a thumb, where it reopens the keyboard over the reply nobody
	// has read yet. The request is still consumed either way, so it does not sit
	// around waiting to fire the next time the composer appears.
	$effect(() => {
		if (editor.shouldFocusTextarea && editor.promptTextarea) {
			if (!isTouchPrimary()) editor.promptTextarea.focus();
			editor.shouldFocusTextarea = false;
		}
	});

	/**
	 * Arriving from a search result: `?m=<index>` names the passage that was
	 * chosen, so land on it rather than at the bottom of the conversation.
	 */
	const searchMatchIndex = $derived.by(() => {
		const raw = page.url.searchParams.get('m');
		if (raw === null) return null;
		const index = Number(raw);
		return Number.isInteger(index) && index >= 0 ? index : null;
	});

	/**
	 * Watched rather than run once on mount.
	 *
	 * Opening a result from the search dialog is a client-side navigation: the
	 * component is reused, so `onMount` never fires again and the jump only ever
	 * worked on a full reload. Following the URL means it also works when the
	 * dialog is used twice in a row on the same conversation.
	 */
	$effect(() => {
		const index = searchMatchIndex;
		if (index === null) return;
		void highlightMessage(index);
	});

	/**
	 * The message may not be in the DOM yet — the conversation has just been
	 * swapped in and its articles render over the following frames — so wait for
	 * it rather than giving up on the first miss.
	 */
	async function highlightMessage(index: number): Promise<void> {
		await tick();

		let target: HTMLElement | null = null;
		for (let attempt = 0; attempt < 20 && !target; attempt++) {
			target = document.getElementById(`message-${index}`);
			if (!target) await new Promise((resolve) => requestAnimationFrame(resolve));
		}
		if (!target) return;

		target.scrollIntoView({ block: 'center' });

		// Restart the animation even when the same message is chosen twice: removing
		// the class isn't enough on its own, the reflow in between is what makes the
		// browser treat it as a new animation.
		target.classList.remove('message--found');
		void target.offsetWidth;
		target.classList.add('message--found');
		setTimeout(() => target?.classList.remove('message--found'), 2000);
	}

	onMount(async () => {
		handleSessionChange();
	});

	beforeNavigate((navigation) => {
		// Only a turn running in this tab is at risk from leaving it. One running in
		// the server keeps going and is waiting when the conversation is opened
		// again, so asking whether to abandon it would be asking about a danger that
		// no longer exists.
		if (editor.isCompletionInProgress && runLocation !== 'server') {
			const userConfirmed = confirm($LL.areYouSureYouWantToLeave());
			if (userConfirmed) {
				stopCompletion();
				return;
			}
			navigation.cancel();
			return;
		}

		// Leaving a server-side turn only stops watching it.
		if (runLocation === 'server') stopFollowing?.();

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
		// Opening another conversation reuses this component, so what was on screen
		// for the last one has to be put down explicitly. Without this the streaming
		// article of the conversation you just left is the first thing the next one
		// shows, and the run being followed is the wrong conversation's.
		stopFollowing?.();
		stopFollowing = null;
		activeRun = null;
		runLocation = 'none';
		editor.isCompletionInProgress = false;
		editor.completion = '';
		editor.reasoning = '';
		editor.reasoningTrace = undefined;
		editor.isSearching = false;
		editor.searchActivity = undefined;
		editor.searchQuery = undefined;
		editor.webSearchInfo = undefined;

		session = data.session;
		modelName = session.model?.name || '';
		editor.view = 'messages';
		editor.isNewSession = !session?.messages?.length;
		editor.interactiveChoices = $settingsStore.interactiveChoices;
		editor.sendCurrentDate = $settingsStore.sendCurrentDate;
		editor.thinking = true;
		if (searchMatchIndex === null) scrollToBottom();

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
			editor.webFetch = pending.webFetch;
			// Carry over the composer tool switches set on the home page (undefined →
			// keep the session defaults already assigned above).
			if (pending.thinking !== undefined) editor.thinking = pending.thinking;
			if (pending.interactiveChoices !== undefined)
				editor.interactiveChoices = pending.interactiveChoices;
			if (pending.sendCurrentDate !== undefined) editor.sendCurrentDate = pending.sendCurrentDate;

			const context = contextMessages(pending.attachments);
			if (context.length) session.messages = [...session.messages, ...context];

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
			return;
		}

		// The reason any of this exists: a turn that was still going when the page
		// went away is picked back up here, transcript and all. Here rather than in
		// `onMount`, because opening another conversation reuses this component and
		// never mounts it again, which is the ordinary way you leave and come back.
		void reattach();
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

	/**
	 * Who answers this turn.
	 *
	 * The personas named with `@` in the message just sent, in the order they were
	 * named, each carrying everything they are: their model, their server, their
	 * options, their prompt, their tools. Nothing is borrowed from the conversation
	 * except the conversation itself, which is the point of calling one in.
	 *
	 * Empty means the conversation's own assistant, which is every turn that
	 * mentions nobody. Naming somebody is choosing them, so the assistant does not
	 * answer alongside them.
	 */
	function speakersFor(messages: Message[]): RunSpeaker[] | undefined {
		const lastUser = [...messages].reverse().find((m) => m.role === 'user' && !m.knowledge);
		if (!lastUser?.content) return undefined;

		const named = mentionedPersonas(lastUser.content, $personasStore ?? []);
		if (!named.length) return undefined;

		const speakers: RunSpeaker[] = [];

		for (const persona of named) {
			// Its own model, and the conversation's when it names one nobody has. A
			// persona that cannot answer at all would be worse than one answering on
			// the model in front of it.
			const model =
				$settingsStore.models.find((m) => m.name === persona.modelName) ?? session.model;
			const server = $serversStore.find((srv) => srv.id === model?.serverId);
			if (!model?.name || !server) continue;

			const framing = resolvePrompt('personaSummoned', $settingsStore.promptOverrides, {
				name: persona.name
			});
			const language = languageInstruction(persona);

			speakers.push({
				personaId: persona.id,
				name: persona.name,
				server: isServerMode ? { kind: 'id', id: server.id } : { kind: 'inline', server },
				model: model.name,
				options:
					persona.params?.temperature != null ? { temperature: persona.params.temperature } : {},
				think: editor.thinking !== false,
				systemPrompt: [persona.systemPrompt, language, framing].filter(Boolean).join('\n\n'),
				flags: {
					// Its own capabilities, not the composer's: the toggles above the input
					// belong to the conversation's assistant, and a persona that searches
					// the web searches the web wherever it is asked to speak.
					webSearch: !!persona.webSearch,
					webFetch: !!editor.webFetch,
					interactiveChoices: !!editor.interactiveChoices,
					sendCurrentDate: !!editor.sendCurrentDate,
					nativeTools: $settingsStore.nativeTools,
					webSearchAuto: $settingsStore.webSearchAuto
				},
				capabilities: { search: searchAvailable, fetch: $webFetchConfig.available }
			});
		}

		return speakers.length ? speakers : undefined;
	}

	/**
	 * Send a turn and follow it.
	 *
	 * Everything that used to happen inline here now happens in the orchestrator,
	 * which is what lets the same turn run in a process that outlives this page.
	 * What is left is the page's own half of the job: settle what the turn is,
	 * hand it over, and apply what comes back.
	 */
	async function handleCompletion(messages: Message[]) {
		const server = $serversStore.find((s) => s.id === session.model?.serverId);
		if (!server) throw new Error('Server not found');
		if (!session.model?.name) throw new Error('No model');

		editor.abortController = new AbortController();
		editor.isCompletionInProgress = true;
		editor.prompt = '';
		editor.completion = '';
		editor.reasoning = '';
		editor.reasoningTrace = undefined;
		editor.streamingReasoningExpanded = false;
		editor.isSearching = false;
		editor.searchActivity = undefined;
		editor.searchQuery = undefined;
		editor.webSearchInfo = undefined;

		// Compaction acts here and nowhere else: the conversation keeps every message
		// it ever had, and only what leaves for the model is cut back to the last
		// summary. Without a marker this returns the array untouched, which is what
		// every conversation written before compaction existed gets.
		const onServer = $settingsStore.serverSideGeneration;
		// Said now rather than when the server answers: between the two there is a
		// round trip, and a page that thinks the turn is in this tab for the length
		// of it will warn about losing something that is not at risk.
		runLocation = onServer ? 'server' : 'tab';

		const input: RunInput = {
			sessionId: session.id,
			// Server mode names a connection and lets the instance resolve it, keys
			// included. Local mode owns its connections, so it hands one over.
			server: isServerMode ? { kind: 'id', id: server.id } : { kind: 'inline', server },
			model: session.model.name,
			options: session.options,
			think: editor.thinking !== false,
			systemPrompt: session.systemPrompt.content || undefined,
			messages: messagesInContext(messages),
			flags: {
				webSearch: !!editor.webSearch,
				webFetch: !!editor.webFetch,
				interactiveChoices: !!editor.interactiveChoices,
				sendCurrentDate: !!editor.sendCurrentDate,
				nativeTools: $settingsStore.nativeTools,
				webSearchAuto: $settingsStore.webSearchAuto
			},
			capabilities: {
				search: searchAvailable,
				fetch: $webFetchConfig.available
			},
			promptOverrides: $settingsStore.promptOverrides,
			speakers: speakersFor(messages),
			sequential: $settingsStore.mentionsSequential !== false,
			// Only local mode sends these: they are the browser's own configuration,
			// and in server mode the instance answers the same questions itself.
			local: isServerMode
				? undefined
				: {
						search: {
							url: $searchConfig.url,
							backend: $searchConfig.backend,
							// The token is deliberately not in the view the interface reads: it
							// is a credential, so it is taken from where it is stored.
							token: $settingsStore.searchToken ?? ''
						},
						fetch: { maxPages: $webFetchConfig.maxPages, maxChars: $webFetchConfig.maxChars }
					}
		};

		// Both are asked for before the turn goes out, because both are about the
		// state it will leave behind: a conversation with no assistant message yet is
		// the one about to earn a name, and automatic compaction is due once this
		// answer has landed rather than before it does.
		const wants = {
			title:
				$chatDefaultsConfig.title.generateTitlesWithAI &&
				!session.title &&
				session.messages.filter((m) => m.role === 'assistant').length === 0,
			compact: compactConfig.autoCompact && !isCompacting
		};

		if (!onServer) {
			try {
				await runLocally(
					input,
					session,
					wants,
					(event) => applyRunEvent(event, surface),
					editor.abortController.signal
				);
			} finally {
				runLocation = 'none';
			}
			return;
		}

		// The server writes the title and the summary itself, so it has to be told
		// which model to use for each: the browser is where that configuration lives.
		if (wants.title && $chatDefaultsConfig.title.titleModel) {
			input.title = {
				model: $chatDefaultsConfig.title.titleModel,
				serverId: $chatDefaultsConfig.title.titleServerId || session.model.serverId
			};
		}
		if (wants.compact && contextUsage(session, compactConfig.compactThreshold).ratio >= 1) {
			input.compact = {
				model: compactConfig.compactModel || session.model.name,
				serverId: compactConfig.compactServerId || session.model.serverId,
				keepRecent: 0
			};
		}

		try {
			const run = await startRun(input);
			await follow(run.id, 0);
		} catch (error) {
			// The handover itself failed, which is different from the turn failing:
			// nothing has been started, so the tab runs it rather than losing the
			// message. A server that is down should cost a promise, not an answer.
			console.warn('Falling back to a local run:', error);
			runLocation = 'tab';
			try {
				await runLocally(
					input,
					session,
					wants,
					(event) => applyRunEvent(event, surface),
					editor.abortController.signal
				);
			} finally {
				runLocation = 'none';
			}
		}
	}

	/**
	 * Where the turn in progress is running.
	 *
	 * One value rather than two, and set before the request goes out rather than
	 * when the answer to it comes back. Derived from a pair, there was a moment
	 * between "a turn started" and "the server acknowledged it" where the page
	 * believed the turn was in this tab, and leaving during that moment asked
	 * whether to abandon something that was in no danger.
	 */
	let runLocation = $state<'none' | 'tab' | 'server'>('none');
	/** The id of the run this page is watching, if it is watching one. */
	let activeRun = $state<string | null>(null);
	let stopFollowing: (() => void) | null = null;

	/**
	 * Watch a server-side run and apply what it sends.
	 *
	 * The same reducer the local path uses, from the same events, which is what
	 * makes reattaching after a reload identical to having watched it all along.
	 */
	async function follow(runId: string, from: number, replayThrough = 0) {
		activeRun = runId;
		runLocation = 'server';
		rememberRun(session.id, runId);
		editor.isCompletionInProgress = true;

		let ended = false;
		const { done, stop } = followRun(
			runId,
			from,
			(event, replay) => {
				if (event.type === 'done' || event.type === 'error') ended = true;
				applyRunEvent(event, surface, { replay });
			},
			{
				replayThrough,
				// The backlog lands in one flush, so there is exactly one place the
				// conversation should be: at the end of it. Following each fragment on
				// the way would be answering a question nobody asked, a hundred times.
				onCaughtUp: () => void scrollToBottom(true)
			}
		);
		stopFollowing = stop;

		try {
			await done;
		} finally {
			stopFollowing = null;
			activeRun = null;
			runLocation = 'none';
			// Only an ending clears the note. Closing the window on a turn that is
			// still going is the case the note exists for, so leaving must not erase
			// the one thing that says there is something to come back to.
			if (ended) forgetRun(session.id);
			else editor.isCompletionInProgress = false;
		}
	}

	/**
	 * Pick up a turn that was already running when this page loaded.
	 *
	 * The whole point of the exercise, and deliberately asked of the server rather
	 * than trusted from what this browser remembers: the note in local storage is
	 * only a hint that there may be something to collect.
	 */
	async function reattach() {
		if (!$settingsStore.serverSideGeneration) return;
		if (activeRun) return;

		const sessionId = session.id;
		// The note the tab that started it left behind. It is only a hint, and the
		// server is still asked; but it is enough to say "still going" immediately
		// rather than after a round trip, which is the difference between coming
		// back to a conversation that looks stalled and one that looks alive.
		const hint = rememberedRun(sessionId);
		if (hint) editor.isCompletionInProgress = true;

		const run = await runForSession(sessionId).catch(() => null);
		// The conversation may have changed under us while that was in flight.
		if (sessionId !== session.id) return;

		if (!run) {
			if (hint) {
				forgetRun(sessionId);
				editor.isCompletionInProgress = false;
			}
			return;
		}

		// From zero: the log is replayed in full, so what the tab missed and what it
		// would have seen are the same thing. What the run had already written by the
		// time it answered is history, and is applied as history rather than
		// performed: on a local model at ten tokens a second, a reply worth leaving
		// the room for is not worth watching a second time.
		await follow(run.id, 0, run.lastEventId);
	}

	/** Where a run's events land, whether the run is in this tab or in the server. */
	const surface: RunSurface = {
		get editor() {
			return editor;
		},
		get session() {
			return session;
		},
		save: () => saveSession(session),
		onProgress: () => void scrollToBottom(),
		setCompacting: (active) => (isCompacting = active),
		onFinish: ({ error }) => {
			if (error) handleError(new Error(error));
		}
	};

	// --- compaction -----------------------------------------------------------

	const compactConfig = $derived($chatDefaultsConfig.compact);
	let isCompacting = $state(false);
	let compactAbort: AbortController | null = null;

	/**
	 * There has to be enough conversation for a summary to be worth a request —
	 * below a handful of messages, compacting costs more context than it frees.
	 */
	const canCompact = $derived(
		!isCompacting &&
			!editor.isCompletionInProgress &&
			messagesInContext(session.messages).length >= 4
	);

	/**
	 * Something to fold away, and nothing already running.
	 *
	 * A lower bar than compaction's: clearing costs no request and frees whatever
	 * is there, so one message is enough to be worth it.
	 */
	const canClear = $derived(
		!isCompacting &&
			!editor.isCompletionInProgress &&
			messagesInContext(session.messages).length > 0
	);

	/**
	 * Draw a line and start again.
	 *
	 * Nothing is deleted. A marker is appended, everything before it folds under
	 * it, and the model is handed the conversation from that point on. Removing
	 * the marker gives all of it back, which is what makes this safe to reach for:
	 * it costs the model its memory of the exchange, and costs you nothing.
	 */
	function clearContext() {
		const cleared = messagesInContext(session.messages).length;
		if (!cleared) return;

		session.messages = [
			...session.messages,
			{
				role: 'system',
				content: '',
				createdAt: new Date().toISOString(),
				cleared: { generatedAt: new Date().toISOString(), replacedCount: cleared }
			}
		];
		saveSession(session);
	}

	/**
	 * Compact now, and say what happened.
	 *
	 * The waiting and the result are both drawn in the conversation, at the spot
	 * the boundary will land, so there is no success toast: the divider appearing
	 * is the confirmation. Failure still goes to a toast, because the user asked
	 * for the context to be shortened and if it was not, the next message goes out
	 * full-length — silently letting them believe otherwise is how a conversation
	 * hits a provider's wall.
	 */
	async function runCompaction(automatic = false): Promise<boolean> {
		if (isCompacting) return false;
		isCompacting = true;
		compactAbort = new AbortController();
		const signal = compactAbort.signal;
		// The pill is the whole feedback now, so bring it into view before the wait
		// starts rather than after it ends.
		await scrollToBottom(true, true);

		try {
			const { marker } = await compactSession(session, { automatic, signal });
			session.messages = [...session.messages, marker];
			session.updatedAt = new Date().toISOString();
			saveSession(session);
			// Cleared in the same flush as the marker landing, so the pending pill and
			// the real one hand over to each other instead of one following the other.
			isCompacting = false;
			await scrollToBottom(true);
			return true;
		} catch (error) {
			// An abandoned summary is not a failure: the user said stop, and the
			// conversation is exactly as they left it.
			if (!signal.aborted) {
				const message = error instanceof Error ? error.message : String(error);
				toast.error($LL.compactFailed(), { description: message });
			}
			return false;
		} finally {
			isCompacting = false;
			compactAbort = null;
		}
	}

	function cancelCompaction() {
		compactAbort?.abort();
	}

	function runCommand(name: CommandName) {
		if (name === 'clear') {
			// The menu hides it when there is nothing to fold, but the name can still
			// be typed in full, so the refusal lives here rather than only in the menu.
			if (!canClear) {
				toast.info($LL.nothingToClear());
				return;
			}
			clearContext();
			return;
		}
		if (name !== 'compact') return;
		// The menu hides `/compact` when there is nothing to compact, but the name
		// can still be typed in full — so the refusal lives here rather than only in
		// what the autocomplete offers.
		if (!canCompact) {
			toast.info($LL.nothingToCompact());
			return;
		}
		void runCompaction();
	}

	/**
	 * Stop, and keep what was written.
	 *
	 * Only the abort: what to do with a half-written answer is the run's ending,
	 * and it is written down once in the reducer. Doing it here as well is how the
	 * same partial message used to be appended twice.
	 */
	function stopCompletion() {
		editor.abortController?.abort();
		// A server-side turn does not hear an AbortController in this tab, so the
		// stop has to travel. What it wrote so far still comes back as an ending.
		if (activeRun) void cancelRun(activeRun);
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

	/**
	 * Where the conversation is, read from the box itself.
	 *
	 * This is the only thing that ever puts auto-follow back on: you are following
	 * again once you are at the bottom, whether you got there with the button, with
	 * the wheel, or by letting the answer catch up with you.
	 *
	 * It is deliberately not the only thing that turns it off. Geometry cannot tell
	 * a scroll you made from a scroll the page made, and during a generation the
	 * page makes one every frame.
	 */
	function handleScroll() {
		if (!messagesWindow) return;
		const { scrollTop, scrollHeight, clientHeight } = messagesWindow;
		userScrolledUp = scrollTop + clientHeight < scrollHeight - SCROLL_BOTTOM_THRESHOLD;
	}

	/**
	 * Reading upwards stops the follow, at once, from the gesture rather than from
	 * where it lands.
	 *
	 * This is what the page was missing, and it is why scrolling during a
	 * generation caught: a flick of the wheel takes a moment to travel more than
	 * the slack above, and the next token landed inside that moment, scrolled to
	 * the bottom, and killed the momentum with it. Flick, snap back, flick, snap
	 * back. Nothing was wrong with the arithmetic; the intent simply arrived too
	 * late to be acted on.
	 *
	 * A wheel event fires before the scroll it causes, so setting this here means
	 * the frame that would have yanked you back reads it and does nothing.
	 */
	function detachOnIntent() {
		userScrolledUp = true;
	}

	function handleWheel(event: WheelEvent) {
		if (event.deltaY < 0) detachOnIntent();
	}

	/** The same, for a finger: dragging downwards is reading upwards. */
	let touchStartY = 0;
	function handleTouchStart(event: TouchEvent) {
		touchStartY = event.touches[0]?.clientY ?? 0;
	}
	function handleTouchMove(event: TouchEvent) {
		const y = event.touches[0]?.clientY ?? 0;
		if (y > touchStartY + 4) detachOnIntent();
	}

	/**
	 * Bound to the box, and rebound whenever there is a different box.
	 *
	 * This used to be one `addEventListener` in `onMount`, which is a fix rather
	 * than a tidy-up: the scroller lives in the `else` of the view switch, so
	 * opening the model's controls destroyed it and coming back built a new one
	 * with nothing listening to it. From then on `userScrolledUp` was never set
	 * again, auto-follow was permanently on, and the page pulled you back to the
	 * bottom whatever you did.
	 *
	 * As an effect it follows the element, and cleans up after the one that left.
	 * Passive throughout: none of these ever cancels a gesture, they only read it.
	 */
	$effect(() => {
		const box = messagesWindow;
		if (!box) return;

		const passive = { passive: true } as const;
		box.addEventListener('scroll', handleScroll, passive);
		box.addEventListener('wheel', handleWheel, passive);
		box.addEventListener('touchstart', handleTouchStart, passive);
		box.addEventListener('touchmove', handleTouchMove, passive);

		return () => {
			box.removeEventListener('scroll', handleScroll);
			box.removeEventListener('wheel', handleWheel);
			box.removeEventListener('touchstart', handleTouchStart);
			box.removeEventListener('touchmove', handleTouchMove);
		};
	});

	/** One frame may hold at most one queued auto-follow, however many tokens land. */
	let scrollQueued = false;

	/**
	 * `smooth` is for the deliberate jump back (the button): the animation shows
	 * how far you travelled. Auto-follow during streaming stays instant — animating
	 * a scroll that retriggers on every token would never settle.
	 */
	async function scrollToBottom(shouldForceScroll = false, smooth = false) {
		if (!shouldForceScroll && (!messagesWindow || userScrolledUp)) return;
		// Streaming calls this on every chunk. Without coalescing, each one queued
		// its own frame and they piled up faster than they could run.
		if (!shouldForceScroll) {
			if (scrollQueued) return;
			scrollQueued = true;
		}
		await tick();
		requestAnimationFrame(() => {
			if (!shouldForceScroll) scrollQueued = false;
			if (!messagesWindow) return;
			// Re-checked here, not only on the way in: the user may have started
			// scrolling up between the call and this frame, and yanking them back
			// then also cleared `userScrolledUp` — so auto-follow resumed and the
			// page fought every attempt to read further up.
			if (!shouldForceScroll && userScrolledUp) return;
			messagesWindow.scrollTo({
				top: messagesWindow.scrollHeight,
				behavior: smooth ? 'smooth' : 'auto'
			});
		});
	}
</script>

{#snippet topBar(floating: boolean)}
	<Header confirmDeletion={shouldConfirmDeletion} {floating}>
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

		<!-- The phone's two buttons. Deleting takes the pill over while it waits for an
		     answer, rather than asking somewhere else: there is nowhere else. -->
		{#snippet compact()}
			{#if shouldConfirmDeletion}
				<ButtonDelete sitemap={Sitemap.SESSIONS} id={session.id} bind:shouldConfirmDeletion />
			{:else}
				<button
					type="button"
					class="flex h-9 w-9 items-center justify-center rounded-full text-muted transition-colors hover:bg-shade-2 hover:text-active"
					onclick={() => (sessionModalOpen = true)}
					aria-label={$LL.session()}
				>
					<Settings2 class="h-5 w-5" />
				</button>

				<Menu class="w-64" align="start">
					{#snippet trigger({ props })}
						<button
							{...props}
							type="button"
							class="flex h-9 w-9 items-center justify-center rounded-full text-muted transition-colors hover:bg-shade-2 hover:text-active"
							aria-label={$LL.moreOptions()}
						>
							<MoreHorizontal class="h-5 w-5" />
						</button>
					{/snippet}

					<!-- The title lives here now, and this is the one place it has room to be
					     read: two lines, fixed, cut with an ellipsis past that, so the menu
					     never changes height with the conversation it belongs to. -->
					<p class="line-clamp-2 px-2 py-1.5 text-xs leading-snug text-muted">
						{editor.isNewSession ? $LL.newSession() : resolveSessionTitle(session)}
					</p>
					<div class="my-1 h-px bg-shade-3" role="none"></div>

					{#if !editor.isNewSession}
						<SessionMenu
							id={session.id}
							pinned={session.pinned}
							onDelete={() => (shouldConfirmDeletion = true)}
						/>
					{/if}
				</Menu>
			{/if}
		{/snippet}
	</Header>
{/snippet}

{#snippet composer()}
	<Prompt
		bind:session
		bind:editor
		{handleSubmit}
		{stopCompletion}
		{scrollToBottom}
		{pendingChoice}
		{chooseAnswer}
		{runCommand}
		{canCompact}
		{canClear}
		contextThreshold={compactConfig.compactThreshold}
	/>
{/snippet}

<div class="session relative flex h-full w-full flex-col overflow-hidden">
	<Head
		title={[editor.isNewSession ? $LL.newSession() : resolveSessionTitle(session), $LL.sessions()]}
	/>
	{#if !floatingHeader}
		{@render topBar(false)}
	{/if}

	<!-- Under the bar rather than beneath it, so neither owes the other any room. -->
	{#if editor.view === 'controls'}
		<div class="flex min-h-0 flex-grow flex-col surface-pane">
			<Controls bind:session />
		</div>
	{:else}
		<!-- The transcript and the button that returns to its foot, in one box: the
		     button then anchors to the conversation rather than to the column, and
		     stops needing to be told how tall the composer happens to be.

		     Its scrollbar gutter is reserved whether or not there is a scrollbar to
		     put in it, because the two floating bars live inside this box: otherwise
		     they would be a scrollbar narrower on a long conversation than on a short
		     one, and would shift sideways the moment a reply made the page overflow.
		     A no-op where scrollbars are drawn over the content and take no room, which
		     is the case this now asks for.

		     The scrollbar itself is the platform's, deliberately, where the rest of the
		     app styles its own. Styling one at all is what opts an element out of the
		     overlay behaviour macOS and iOS give it: any width, any colour, and the bar
		     stops fading away and sits there for the length of the conversation. That
		     trade is worth it on a code block, where a bar is how you learn the line
		     runs past the edge. It is not worth it down the side of the thing you are
		     reading. -->
		<div class="relative flex min-h-0 flex-grow flex-col">
			<div
				class="session__history flex flex-grow flex-col overflow-auto px-4 surface-pane lg:px-6 xl:px-8"
				style="scrollbar-gutter: stable"
				bind:this={messagesWindow}
			>
				{#if floatingHeader}
					<!-- The mirror image of the composer below: sticky rather than laid on
					     top, so it reserves its own room at the head of the conversation and
					     never covers the first message, while everything after it passes
					     behind on the way up. -->
					<div class="sticky top-0 z-20 -mx-4 lg:-mx-6 xl:-mx-8">
						{@render topBar(true)}
					</div>
				{/if}
				<!-- Grows to fill whatever the conversation does not, which is what puts the
				     composer at the foot of a short exchange instead of halfway up the page.
				     A sticky element only sticks once there is something to scroll; below
				     that it simply sits where the flow leaves it, and the flow is what this
				     corrects. -->
				<div class="grow">
					<Messages
						bind:session
						bind:editor
						{handleRetry}
						{chooseAnswer}
						{pendingChoice}
						assistantLabel={persona?.name}
						{isCompacting}
						onCancelCompaction={cancelCompaction}
					/>
				</div>

				{#if floatingComposer}
					<!-- Sticky rather than laid on top, which is the whole of the difference:
					     it stays in the flow, so it reserves its own room at the end of the
					     conversation and never covers the last message, while everything above
					     passes behind it on the way there. Nothing measures it, nothing pads
					     for it. The negative margins undo the transcript's side gutter so it
					     spans the column rather than the text; there is no vertical one left to
					     undo, because a stuck element anchors to the inside of the scrollport
					     and a padding there would have pushed it back down. -->
					<div class="sticky bottom-0 z-10 -mx-4 lg:-mx-6 xl:-mx-8">
						<!-- Scrolling up during a reply silently opts you out of auto-follow;
						     without this there is nothing to say content is still arriving below,
						     nor any way back short of dragging. Carried by the composer, so it
						     stands above it without anyone having to know how tall it is. -->
						{#if userScrolledUp}
							<button
								type="button"
								transition:fly={{ y: 8, duration: 150 }}
								onclick={() => scrollToBottom(true, true)}
								aria-label={$LL.scrollToBottom()}
								title={$LL.scrollToBottom()}
								class="scroll-to-bottom absolute -top-11 left-1/2 z-20 flex h-9 w-9 -translate-x-1/2 items-center justify-center rounded-full border border-shade-3 bg-shade-0 text-muted shadow-md transition-colors hover:text-active"
							>
								<ArrowDown class="base-icon" />
							</button>
						{/if}
						{@render composer()}
					</div>
				{/if}
			</div>
		</div>
	{/if}

	<!-- Drawn in one of two places, never both, which is why it is written once and
	     rendered where it belongs. -->
	{#if !floatingComposer}
		<div class="shrink-0 surface-chrome">
			{@render composer()}
		</div>
	{/if}
</div>

<SessionModal bind:open={sessionModalOpen} bind:session bind:modelName />
