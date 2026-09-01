import { tick } from 'svelte';
import { fromStore, get } from 'svelte/store';

import LL from '$i18n/i18n-svelte';
import { effectivePrompts } from '$lib/appPrompts';
import { formatAskAnswer } from '$lib/askChoice';
import { mergeSampling, type SamplingOptions } from '$lib/chat/options';
import { chatDefaultsConfig } from '$lib/chatDefaults';
import type { Server } from '$lib/connections';
import { repository } from '$lib/data';
import { resolvePrompt } from '$lib/defaultPrompts';
import { clearDraft, readDraft, sessionDraft, writeDraft } from '$lib/drafts';
import { personasStore, serversStore, sessionsStore, settingsStore } from '$lib/localStorage';
import { languageInstruction } from '$lib/personas';
import { playbookInstructions, playbooksOf } from '$lib/playbooks';
import { contextMessages, imagesPayload } from '$lib/promptAttachments';
import { searchConfig } from '$lib/search';
import { saveSession, type Editor, type Message, type Session } from '$lib/sessions';
import type { PendingMessage } from '$lib/stores/pendingMessage';
import { effectiveSystemPrompt, systemPromptsConfig } from '$lib/systemPrompts';
import { toast } from '$lib/toast';
import { webFetchConfig } from '$lib/webFetch';

import type { CommandName } from './commands';
import { compactSession } from './compact';
import { contextSnapshot, contextUsage } from './context';
import { mentionedPersonas } from './mentions';
import { messagesInContext } from './notes';
import { refusalIn } from './refusal';
import { applyRunEvent, type RunSurface } from './run/apply';
import { cancelRun, decideApproval, followRun, runForSession, startRun } from './run/client';
import type { RunInput, RunSpeaker } from './run/types';

/* eslint-disable svelte/prefer-svelte-reactivity -- the rule guards against a
   `Date` held as reactive state, where mutating it would go unnoticed. Every one
   here is read straight into an ISO string and thrown away, which is also how the
   rest of the app stamps a message. */

/** Images as the composer hands them over, already encoded. */
export type PromptImages = { data: string; filename: string }[];

/** The part of a conversation only a rendered page can do: where the reader is looking. */
export interface ConversationView {
	scrollToBottom(force?: boolean, smooth?: boolean): void | Promise<void>;
}

/** A prompt named in the URL, for a conversation opened with one. */
export interface QueryEntry {
	prompt: string;
	model?: string;
	search?: boolean;
}

/** What the conversation was opened with, if it was opened with anything. */
export interface OpenEntry {
	/** A message composed elsewhere and handed over, submitted on arrival. */
	pending?: PendingMessage | null;
	/** The same, named in the address instead. */
	query?: QueryEntry | null;
	/** False when the address names a message to land on instead. A view decision, so the view makes it. */
	atBottom?: boolean;
}

/**
 * A conversation, and everything that happens to one.
 *
 * The line is between the conversation and the screen showing it. Sending a
 * turn, following it, picking it back up after a reload, folding the context
 * away, calling a persona in: all of that is here. Scroll position, which
 * message is lit, whether the composer floats: that stays in the page.
 *
 * No `$effect` here. Whoever renders it watches what needs watching and calls
 * the methods below, which is what makes this usable from a second interface.
 */
export class Conversation implements RunSurface {
	session: Session = $state()!;
	editor: Editor = $state()!;

	/** The name rather than the model: the picker is a list of names, and a conversation can carry one that no longer resolves. */
	modelName: string | undefined = $state();

	/** The id of the run being watched, if one is being watched. */
	activeRun: string | null = $state(null);

	/** Whether a summary is being written, drawn where the divider will land. */
	isCompacting = $state(false);

	/** A refusal to show, which is not the same thing as a failure to report. */
	refusalOpen = $state(false);
	refusalDetail: string | undefined = $state();

	readonly #view: ConversationView;

	readonly #settings = fromStore(settingsStore);
	readonly #servers = fromStore(serversStore);
	readonly #personas = fromStore(personasStore);
	readonly #search = fromStore(searchConfig);
	readonly #webFetch = fromStore(webFetchConfig);
	readonly #chatDefaults = fromStore(chatDefaultsConfig);

	#stopFollowing: (() => void) | null = null;
	#compactAbort: AbortController | null = null;

	/** The last system prompt we auto-resolved, so a model switch can update it without overwriting one somebody wrote. */
	#lastAutoSystemPrompt = '';

	constructor(session: Session, view: ConversationView) {
		this.#view = view;
		this.session = session;
		this.editor = {
			prompt: '',
			messageIndexToEdit: null,
			isExpanded: false,
			isCompletionInProgress: false,
			shouldFocusTextarea: false,
			isNewSession: true,
			webSearch: this.searchAvailable && this.#settings.current.webSearchByDefault,
			webFetch: this.#webFetch.current.available && this.#settings.current.webFetchByDefault,
			interactiveChoices: this.#settings.current.interactiveChoices,
			sendCurrentDate: this.#settings.current.sendCurrentDate,
			thinking: true,
			// On, like every other tool switch: what makes MCP safe is the question asked
			// before each call, not a switch somebody has to find first.
			mcp: this.#settings.current.mcpByDefault,
			// Declared rather than left undefined: Svelte refuses `bind:` against a prop
			// with a fallback when the bound value is undefined, and reattaching to a run
			// in progress hit that before the first turn had set it.
			streamingReasoningExpanded: false
		};
	}

	// --- what the conversation can be asked to do ------------------------------

	get searchAvailable(): boolean {
		return this.#search.current.available;
	}

	get compactConfig() {
		return this.#chatDefaults.current.compact;
	}

	/**
	 * The account's sampling with this conversation's own laid over it, resolved at
	 * send time so a change in Settings reaches every conversation that never
	 * disagreed.
	 */
	get options(): SamplingOptions {
		return mergeSampling(this.#chatDefaults.current.sampling.value, this.session.options);
	}

	/** Below a handful of messages, compacting costs more context than it frees. */
	readonly canCompact = $derived(
		!this.isCompacting &&
			!this.editor.isCompletionInProgress &&
			messagesInContext(this.session.messages).length >= 4
	);

	/** A lower bar than compaction's: clearing costs no request, so one message is enough. */
	readonly canClear = $derived(
		!this.isCompacting &&
			!this.editor.isCompletionInProgress &&
			messagesInContext(this.session.messages).length > 0
	);

	/** The unanswered quick-choice: docked above the composer, and skipped in the message list until answered. */
	readonly pendingChoice = $derived.by(() => {
		if (this.editor.isCompletionInProgress) return null;
		const last = this.session.messages.at(-1);
		return last?.role === 'assistant' && last.choices && !last.choices.answered ? last : null;
	});

	// --- opening, and what that means ------------------------------------------

	/**
	 * Point this at a conversation, whichever one was there before.
	 *
	 * Opening another reuses whatever is rendering this one, so what was on screen
	 * has to be put down explicitly. The entry point is handed in: a prompt in the
	 * address bar is the router's business.
	 */
	async open(session: Session, entry: OpenEntry = {}): Promise<void> {
		this.detach();
		this.activeRun = null;
		this.editor.isCompletionInProgress = false;
		this.editor.completion = '';
		this.editor.reasoning = '';
		this.editor.reasoningTrace = undefined;
		this.editor.isSearching = false;
		this.editor.searchActivity = undefined;
		this.editor.searchQuery = undefined;
		this.editor.webSearchInfo = undefined;

		this.session = session;
		this.modelName = session.model?.name || '';
		this.editor.isNewSession = !session?.messages?.length;
		this.editor.interactiveChoices = this.#settings.current.interactiveChoices;
		this.editor.sendCurrentDate = this.#settings.current.sendCurrentDate;
		this.editor.thinking = true;
		this.editor.mcp = this.#settings.current.mcpByDefault;
		this.editor.pendingApproval = undefined;
		if (entry.atBottom !== false) void this.#view.scrollToBottom();

		// A persona conversation carries its own web-search preference.
		const boundPersona = this.session.personaId
			? this.#personas.current.find((p) => p.id === this.session.personaId)
			: null;
		if (boundPersona) {
			this.editor.webSearch = this.searchAvailable && !!boundPersona.webSearch;
			// Heal the model if it wasn't resolvable when the conversation was created.
			if (!this.session.model && boundPersona.modelName) this.modelName = boundPersona.modelName;
		}

		if (entry.pending) {
			await this.#submitHandover(entry.pending);
			return;
		}

		if (entry.query) {
			await this.#submitQuery(entry.query);
			return;
		}

		// Whatever was left in the composer last time. After the two hand-offs above:
		// they arrive with something to send now, a draft is what you had not sent.
		this.editor.prompt = readDraft(sessionDraft(this.session.id));

		// The reason any of this exists: a turn still going when the page went away is
		// picked back up here, transcript and all.
		void this.reattach();
	}

	/** A message composed elsewhere (prompt + model + attachments), sent on arrival. */
	async #submitHandover(pending: PendingMessage): Promise<void> {
		this.editor.prompt = pending.prompt;
		this.editor.isNewSession = false;

		if (pending.model) {
			this.modelName = pending.model;
			const model = this.#settings.current.models.find((m) => m.name === pending.model);
			if (model) this.session.model = model;
		}

		this.editor.webSearch = pending.webSearch;
		this.editor.webFetch = pending.webFetch;
		// Composer tool switches from the home page (undefined keeps the session defaults).
		if (pending.thinking !== undefined) this.editor.thinking = pending.thinking;
		if (pending.interactiveChoices !== undefined)
			this.editor.interactiveChoices = pending.interactiveChoices;
		if (pending.sendCurrentDate !== undefined)
			this.editor.sendCurrentDate = pending.sendCurrentDate;
		if (pending.mcp !== undefined) this.editor.mcp = pending.mcp;

		const context = contextMessages(pending.attachments);
		if (context.length) this.session.messages = [...this.session.messages, ...context];

		const images = imagesPayload(pending.attachments);
		await tick();
		this.submit(images.length ? images : undefined);
	}

	/** The same handover, named in the address instead of carried in a store. */
	async #submitQuery(query: QueryEntry): Promise<void> {
		this.editor.prompt = query.prompt;
		this.editor.isNewSession = false;

		if (query.model) {
			this.modelName = query.model;
			const model = this.#settings.current.models.find((m) => m.name === query.model);
			if (model) this.session.model = model;
		}

		if (query.search) this.editor.webSearch = true;

		await tick();
		this.submit();
	}

	/** Called by whoever draws it, so this class keeps no effects of its own. */
	rememberDraft = (): void => {
		writeDraft(sessionDraft(this.session.id), this.editor.prompt ?? '');
	};

	/** Reads both things it depends on, so a watcher watches a plain call. */
	syncModel = (): void => {
		this.session.model = this.#settings.current.models.find((m) => m.name === this.modelName);
	};

	/** Re-resolve the system prompt when the model changes (new/unedited sessions). */
	autoResolveSystemPrompt = (): void => {
		if (this.session.systemPromptEdited) return;
		if (this.session.messages.some((m) => m.role === 'assistant')) return; // conversation already started
		const current = this.session.systemPrompt.content;
		if (current && current !== this.#lastAutoSystemPrompt) return; // written by hand: leave it
		const resolved = effectiveSystemPrompt(this.modelName, get(systemPromptsConfig).prompts);
		if (resolved === current) return;
		this.session.systemPrompt = { ...this.session.systemPrompt, content: resolved };
		this.#lastAutoSystemPrompt = resolved;
	};

	// --- sending ----------------------------------------------------------------

	submit = (images?: PromptImages): void => {
		if (!this.editor.prompt && (!images || images.length === 0)) return;
		if (!this.session.model) return;
		this.editor.isExpanded = false;
		this.editor.isNewSession = false;
		// Sent is no longer a draft, and the composer is already empty.
		clearDraft(sessionDraft(this.session.id));

		if (this.editor.messageIndexToEdit !== null) void this.#submitEdit(images);
		else void this.#submitNew(images);
	};

	async #submitNew(images?: PromptImages): Promise<void> {
		const message: Message = {
			role: 'user',
			content: this.editor.prompt,
			createdAt: new Date().toISOString()
		};
		if (images && images.length) message.images = images;
		this.session.messages = [...this.session.messages, message];
		// Written before the turn goes out, not after it comes back: a reload, a crash
		// or a failure between sending and answering used to take the message with it,
		// since storage was only reached when a reply landed.
		this.save();
		await this.#view.scrollToBottom(true); // Force scroll after submitting prompt
		await this.complete(this.session.messages);
	}

	async #submitEdit(images?: PromptImages): Promise<void> {
		if (this.editor.messageIndexToEdit === null) return;

		const msg = this.session.messages[this.editor.messageIndexToEdit];
		msg.content = this.editor.prompt;
		if (images) {
			msg.images = images;
		} else {
			delete msg.images;
		}

		// Remove all messages after the edited message
		this.session.messages = this.session.messages.slice(0, this.editor.messageIndexToEdit + 1);

		this.editor.messageIndexToEdit = null;
		this.editor.prompt = '';

		// Same reason as a new message: the edit is what you meant to say.
		this.save();
		await this.complete(this.session.messages);
	}

	/** A quick-choice selection becomes a normal user message (no tool_result). */
	choose = (text: string): void => {
		if (!text || this.editor.isCompletionInProgress) return;
		this.editor.prompt = text;
		this.submit();
	};

	/** Locks the picked options onto the message, so a reload renders them, and sends the selection as a normal user message. */
	answerChoice = (message: Message, selected: string[][]): void => {
		if (!message.choices || message.choices.answered) return;
		const text = formatAskAnswer(message.choices.questions, selected);
		if (!text) return;
		message.choices = { ...message.choices, answered: true, selected };
		this.save();
		this.choose(text);
	};

	/**
	 * The card disappears when the run says the question is over, not when the
	 * button is pressed: a second tab may have answered first.
	 */
	approveTool = (allow: boolean): void => {
		const request = this.editor.pendingApproval;
		if (!request || !this.activeRun) return;
		void decideApproval(this.activeRun, request.id, allow);
	};

	retry = async (index: number): Promise<void> => {
		// Remove all the messages after the index
		this.session.messages = this.session.messages.slice(0, index);

		const mostRecentUserMessage = this.session.messages.filter((m) => m.role === 'user').at(-1);
		if (!mostRecentUserMessage) throw new Error('No user message to retry');

		await this.complete(this.session.messages);
	};

	/**
	 * Who answers this turn: the personas named with `@`, in order, each carrying
	 * its own model, server, options, prompt and tools.
	 *
	 * Empty means the conversation's own assistant. Naming somebody is choosing
	 * them, so the assistant does not answer alongside them.
	 */
	#speakersFor(messages: Message[]): RunSpeaker[] | undefined {
		const lastUser = [...messages].reverse().find((m) => m.role === 'user' && !m.knowledge);
		if (!lastUser?.content) return undefined;

		const named = mentionedPersonas(lastUser.content, this.#personas.current ?? []);
		if (!named.length) return undefined;

		const speakers: RunSpeaker[] = [];

		for (const persona of named) {
			// Its own model, and the conversation's when it names one nobody has.
			const model =
				this.#settings.current.models.find((m) => m.name === persona.modelName) ??
				this.session.model;
			const server = this.#servers.current.find((srv) => srv.id === model?.serverId);
			if (!model?.name || !server) continue;

			const framing = resolvePrompt('personaSummoned', get(effectivePrompts), {
				name: persona.name
			});
			const language = languageInstruction(persona);

			speakers.push({
				personaId: persona.id,
				name: persona.name,
				serverId: server.id,
				model: model.name,
				options:
					persona.params?.temperature != null ? { temperature: persona.params.temperature } : {},
				think: this.editor.thinking !== false,
				systemPrompt: [persona.systemPrompt, language, framing].filter(Boolean).join('\n\n'),
				flags: {
					// Its own capabilities, not the composer's: the toggles above the input belong
					// to the conversation's assistant.
					webSearch: !!persona.webSearch,
					webFetch: !!this.editor.webFetch,
					interactiveChoices: !!this.editor.interactiveChoices,
					sendCurrentDate: !!this.editor.sendCurrentDate,
					nativeTools: this.#settings.current.nativeTools,
					webSearchAuto: this.#settings.current.webSearchAuto,
					mcp: !!this.editor.mcp
				},
				capabilities: { search: this.searchAvailable, fetch: this.#webFetch.current.available }
			});
		}

		return speakers.length ? speakers : undefined;
	}

	/**
	 * Send a turn and follow it. The turn itself is the orchestrator's, which is
	 * what lets it run in a process outliving this page; this half settles what the
	 * turn is, hands it over, and applies what comes back.
	 */
	async complete(messages: Message[]): Promise<void> {
		const server = this.#servers.current.find((s) => s.id === this.session.model?.serverId);
		if (!server) throw new Error('Server not found');
		if (!this.session.model?.name) throw new Error('No model');

		this.editor.abortController = new AbortController();
		this.editor.isCompletionInProgress = true;
		this.editor.prompt = '';
		this.editor.completion = '';
		this.editor.reasoning = '';
		this.editor.reasoningTrace = undefined;
		this.editor.streamingReasoningExpanded = false;
		this.editor.isSearching = false;
		this.editor.searchActivity = undefined;
		this.editor.searchQuery = undefined;
		this.editor.webSearchInfo = undefined;

		const input = this.#inputFor(messages, server);
		const wants = this.#wants();

		// The server writes the title and the summary, so it has to be told which model
		// to use for each: the browser is where that configuration lives.
		const titleConfig = this.#chatDefaults.current.title;
		if (wants.title && titleConfig.titleModel) {
			input.title = {
				model: titleConfig.titleModel,
				serverId: this.#connectionFor(titleConfig.titleModel, titleConfig.titleServerId)
			};
		}
		if (
			wants.compact &&
			contextUsage(this.session, this.compactConfig.compactThreshold, this.options).ratio >= 1
		) {
			const model = this.compactConfig.compactModel || this.session.model.name;
			input.compact = {
				model,
				serverId: this.#connectionFor(model, this.compactConfig.compactServerId),
				keepRecent: 0
			};
		}

		try {
			// The server reads the conversation to write into it, so everything this tab
			// has to say must have landed. Ordinary saves are coalesced, which is wrong for
			// the message the turn is about to answer.
			await repository.flush?.();
			const run = await startRun(input);
			await this.#follow(run.id, 0);
		} catch (error) {
			// The handover failed, so there is no turn and this tab has nowhere to run one.
			// The message is still in the conversation and still in the composer.
			this.#handleError(error instanceof Error ? error : new Error(String(error)));
		}
	}

	/**
	 * Which connection serves a model chosen for an errand. A named connection
	 * wins, and the catalogue answers otherwise: these settings store a model by
	 * name alone. Falling back to the conversation's server asked a local Ollama for
	 * a hosted title model, and the 404 went nowhere, since naming is best-effort.
	 */
	#connectionFor(model: string, preferred: string): string {
		if (preferred) return preferred;
		const known = this.#settings.current.models.find((entry) => entry.name === model);
		return known?.serverId ?? this.session.model!.serverId;
	}

	/** Everything the turn is, gathered from where each part of it is kept. */
	#inputFor(messages: Message[], server: Server): RunInput {
		const settings = this.#settings.current;
		const fetchConfig = this.#webFetch.current;

		return {
			sessionId: this.session.id,
			// Named rather than described: the instance resolves the address and the key
			// from its own database, and a browser never holds either.
			serverId: server.id,
			model: this.session.model!.name,
			options: this.options,
			think: this.editor.thinking !== false,
			// Playbooks are appended to the conversation's prompt rather than replacing it:
			// a procedure says how a job is done, not who is doing it. Resolved at send
			// time, so editing one reaches every conversation running it.
			systemPrompt:
				[
					this.session.systemPrompt.content,
					playbookInstructions(playbooksOf(this.session.playbookIds))
				]
					.filter((part) => part?.trim())
					.join('\n\n') || undefined,
			// Only so the turn can find what this persona remembers. Everything else about
			// it is already resolved into the fields above.
			personaId: this.session.personaId,
			// The conversation keeps every message it ever had; only what leaves for the
			// model is cut back to the last summary. No marker means untouched.
			messages: messagesInContext(messages),
			flags: {
				webSearch: !!this.editor.webSearch,
				webFetch: !!this.editor.webFetch,
				interactiveChoices: !!this.editor.interactiveChoices,
				sendCurrentDate: !!this.editor.sendCurrentDate,
				nativeTools: settings.nativeTools,
				webSearchAuto: settings.webSearchAuto,
				mcp: !!this.editor.mcp
			},
			capabilities: {
				search: this.searchAvailable,
				fetch: fetchConfig.available
			},
			promptOverrides: get(effectivePrompts),
			speakers: this.#speakersFor(messages),
			sequential: settings.mentionsSequential !== false
		};
	}

	/**
	 * What this turn should leave behind, asked before it goes out: both are about
	 * the state it will end in.
	 *
	 * The title twice. The first names the question, since nothing has been answered
	 * yet; a few exchanges later there is a conversation to name. Never a third
	 * time, and never over a name someone typed.
	 */
	#wants(): { title: boolean; compact: boolean } {
		const titleConfig = this.#chatDefaults.current.title;
		const replies = this.session.messages.filter((m) => m.role === 'assistant').length;

		return {
			title:
				titleConfig.generateTitlesWithAI &&
				!this.session.titleEdited &&
				((!this.session.title && replies === 0) ||
					(titleConfig.regenerateTitle &&
						!this.session.titleRegenerated &&
						replies + 1 >= titleConfig.regenerateTitleAfter)),
			compact: this.compactConfig.autoCompact && !this.isCompacting
		};
	}

	// --- following, and picking back up ----------------------------------------

	/** The same reducer the local path uses, from the same events, which is what makes reattaching identical to having watched it. */
	async #follow(runId: string, from: number, replayThrough = 0): Promise<void> {
		this.activeRun = runId;
		this.editor.isCompletionInProgress = true;

		let ended = false;
		const { done, stop } = followRun(
			runId,
			from,
			(event, replay) => {
				if (event.type === 'done' || event.type === 'error') ended = true;
				applyRunEvent(event, this, { replay });
				// The run stored what these three changed, but the lists around the
				// conversation are drawn from a summary held in memory here.
				if (event.type === 'message' || event.type === 'title' || event.type === 'compaction') {
					sessionsStore.reflect(this.session);
				}
			},
			{
				replayThrough,
				// The backlog lands in one flush, so there is one place to be: at the end of
				// it. Following each fragment would answer that question a hundred times.
				onCaughtUp: () => void this.#view.scrollToBottom(true)
			}
		);
		this.#stopFollowing = stop;

		try {
			await done;
		} finally {
			this.#stopFollowing = null;
			this.activeRun = null;
			// Stopped watching without the turn ending, which is what leaving does: give
			// the composer back rather than look like something is still arriving.
			if (!ended) this.editor.isCompletionInProgress = false;
		}
	}

	/**
	 * Pick up a turn that was already running when this page loaded. The server is
	 * asked, since it is the one running the turn.
	 *
	 * A run that has already ended is still followed: the conversation was read from
	 * storage a moment earlier, so a turn that landed inside that moment wrote into
	 * a row this page had already read. Replaying the log closes that gap and stores
	 * nothing.
	 */
	async reattach(): Promise<void> {
		if (this.activeRun) return;

		const sessionId = this.session.id;
		const run = await runForSession(sessionId).catch(() => null);
		// The conversation may have changed under us while that was in flight.
		if (sessionId !== this.session.id) return;
		if (!run) return;

		// From zero, so a half-written answer is rebuilt as it stands. What landed
		// before this page opened is applied as history rather than performed, and
		// anything the conversation already holds is recognised and skipped.
		await this.#follow(run.id, 0, run.lastEventId);
	}

	/** Leaving a server-side turn is not abandoning it: it keeps going and is waiting when the conversation is opened again. */
	detach = (): void => {
		this.#stopFollowing?.();
		this.#stopFollowing = null;
	};

	/** Only the abort. What to do with a half-written answer is the run's ending, written down once in the reducer. */
	stop = (): void => {
		this.editor.abortController?.abort();
		// A server-side turn does not hear an AbortController in this tab, so the stop
		// has to travel. What it wrote still comes back as an ending.
		if (this.activeRun) void cancelRun(this.activeRun);
	};

	// --- where a run's events land (RunSurface) ---------------------------------

	save = (): void => {
		saveSession(this.session);
	};

	onProgress(): void {
		void this.#view.scrollToBottom();
	}

	setCompacting(active: boolean): void {
		this.isCompacting = active;
	}

	onFinish({ error }: { aborted: boolean; error?: string }): void {
		if (error) this.#handleError(new Error(error));
	}

	#handleError(error: Error): void {
		const strings = get(LL);
		/**
		 * A refusal is not a failure. A toast says "try again", which is wrong when
		 * somebody set a rule: trying again does the same thing.
		 */
		const refused = refusalIn(error.message);
		if (refused) {
			this.refusalDetail =
				refused.reason === 'unpriced-model' && refused.detail
					? strings.refusedUnpricedModel({ model: refused.detail })
					: strings.refusedCreditLimit();
			this.refusalOpen = true;
			this.#restorePrompt();
			return;
		}

		if (error.message === 'Failed to fetch') {
			toast.error(strings.genericError(), { description: strings.cantConnectToOllamaServer() });
		} else {
			toast.error(strings.genericError(), { description: error.toString() });
		}

		this.#restorePrompt();
	}

	/** Put the message back in the composer and stand the turn down. */
	#restorePrompt(): void {
		const lastUserMessage = this.session.messages.filter((m) => m.role === 'user').at(-1);
		if (lastUserMessage) {
			this.editor.prompt = lastUserMessage.content;
		}
		this.editor.abortController?.abort();
		this.editor.completion = '';
		this.editor.reasoning = '';
		this.editor.isCompletionInProgress = false;
		this.editor.shouldFocusTextarea = true;
	}

	// --- notes: what happened to the conversation -------------------------------

	/**
	 * Draw a line and start again. Nothing is deleted: a marker is appended and
	 * everything before it folds under it. Removing the marker gives it all back.
	 */
	clearContext(): void {
		const cleared = messagesInContext(this.session.messages).length;
		if (!cleared) return;

		this.session.messages = [
			...this.session.messages,
			{
				role: 'system',
				content: '',
				createdAt: new Date().toISOString(),
				note: {
					kind: 'cleared',
					generatedAt: new Date().toISOString(),
					replacedCount: cleared
				}
			}
		];
		this.save();
	}

	/**
	 * A note like the others, so it folds into the conversation and survives a
	 * reload. The model never sees it: `messagesInContext` drops every note that is
	 * not the boundary, and its content is empty, so it never turns up in a search.
	 */
	reportContext(): void {
		this.session.messages = [
			...this.session.messages,
			{
				role: 'system',
				content: '',
				createdAt: new Date().toISOString(),
				note: contextSnapshot(this.session, this.compactConfig.compactThreshold)
			}
		];
		this.save();
		void this.#view.scrollToBottom(true);
	}

	/**
	 * One panel per conversation, moved rather than stacked: two would show the
	 * same live state twice. Nothing is lost, since it records nothing.
	 */
	openPlaybooks(): void {
		this.session.messages = [
			...this.session.messages.filter((message) => message.note?.kind !== 'playbooks'),
			{
				role: 'system',
				content: '',
				createdAt: new Date().toISOString(),
				note: { kind: 'playbooks', generatedAt: new Date().toISOString() }
			}
		];
		this.save();
		void this.#view.scrollToBottom(true);
	}

	/** Switch a procedure on or off for this conversation. */
	togglePlaybook = (id: string): void => {
		const ids = this.session.playbookIds ?? [];
		this.session.playbookIds = ids.includes(id)
			? ids.filter((existing) => existing !== id)
			: [...ids, id];
		this.save();
	};

	/**
	 * Fold a recorded exchange into this conversation, so the model has it too.
	 *
	 * Two messages in the roles they were said in, with a framing on the question
	 * saying where it came from, or the model reads a question it has no memory of
	 * being asked. Adds and never moves: the note keeps the exchange whatever
	 * happens here.
	 */
	addMention = (marker: Message): void => {
		const note = marker.note;
		if (note?.kind !== 'mention' || note.addedAt) return;

		const framing = resolvePrompt('mentionRecall', get(effectivePrompts), {
			title: note.title || get(LL).newSession()
		});
		const at = new Date().toISOString();

		this.session.messages = [
			...this.session.messages.map((message) =>
				message === marker ? { ...message, note: { ...note, addedAt: at } } : message
			),
			{ role: 'user' as const, content: `${framing}\n\n${note.asked}`, createdAt: at },
			{ role: 'assistant' as const, content: note.answered, createdAt: at }
		];
		this.save();
		void this.#view.scrollToBottom(true);
	};

	// --- compaction -------------------------------------------------------------

	/**
	 * Compact now, drawn where the boundary will land, so there is no success
	 * toast: the divider appearing is the confirmation. Failure does toast, or the
	 * next message goes out full-length into a provider's wall.
	 */
	async compact(automatic = false, instruction = ''): Promise<boolean> {
		if (this.isCompacting) return false;
		this.isCompacting = true;
		this.#compactAbort = new AbortController();
		const signal = this.#compactAbort.signal;
		// The pill is the whole feedback, so bring it into view before the wait.
		await this.#view.scrollToBottom(true, true);

		try {
			const { marker } = await compactSession(this.session, { automatic, signal, instruction });
			this.session.messages = [...this.session.messages, marker];
			this.session.updatedAt = new Date().toISOString();
			this.save();
			// Cleared in the same flush as the marker landing, so the pending pill and the
			// real one hand over to each other.
			this.isCompacting = false;
			await this.#view.scrollToBottom(true);
			return true;
		} catch (error) {
			// An abandoned summary is not a failure: the user said stop.
			if (!signal.aborted) {
				const message = error instanceof Error ? error.message : String(error);
				toast.error(get(LL).compactFailed(), { description: message });
			}
			return false;
		} finally {
			this.isCompacting = false;
			this.#compactAbort = null;
		}
	}

	cancelCompaction = (): void => {
		this.#compactAbort?.abort();
	};

	// --- typed commands ----------------------------------------------------------

	runCommand = (name: CommandName, args: string): void => {
		const strings = get(LL);

		if (name === 'context') {
			this.reportContext();
			return;
		}
		if (name === 'playbooks') {
			this.openPlaybooks();
			return;
		}
		if (name === 'clear') {
			// The menu hides it when there is nothing to fold, but the name can still be
			// typed in full.
			if (!this.canClear) {
				toast.info(strings.nothingToClear());
				return;
			}
			this.clearContext();
			return;
		}
		if (name !== 'compact') return;
		// Same: the menu hides `/compact`, but the name can still be typed in full.
		if (!this.canCompact) {
			toast.info(strings.nothingToCompact());
			return;
		}
		void this.compact(false, args);
	};
}
