import { tick } from 'svelte';
import { toast } from 'svelte-sonner';
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
import { webFetchConfig } from '$lib/webFetch';

import type { CommandName } from './commands';
import { compactSession } from './compact';
import { contextSnapshot, contextUsage } from './context';
import { mentionedPersonas } from './mentions';
import { messagesInContext } from './notes';
import { refusalIn } from './refusal';
import { applyRunEvent, type RunSurface } from './run/apply';
import { cancelRun, followRun, runForSession, startRun } from './run/client';
import type { RunInput, RunSpeaker } from './run/types';

/* eslint-disable svelte/prefer-svelte-reactivity -- the rule guards against a
   `Date` held as reactive state, where mutating it would go unnoticed. Every one
   here is read straight into an ISO string and thrown away, which is also how the
   rest of the app stamps a message. */

/** Images as the composer hands them over, already encoded. */
export type PromptImages = { data: string; filename: string }[];

/**
 * The part of a conversation only a rendered page can do.
 *
 * Deliberately one method. Everything else this class needs, it reads from the
 * stores itself; what it cannot know is where the reader is looking, and a
 * transcript that does not follow its own answer is the one thing that has to be
 * arranged from outside.
 */
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
	/**
	 * Whether to land at the foot of the conversation, which is the ordinary case.
	 *
	 * False when the address names a message to land on instead: arriving from a
	 * search result, the passage that was chosen is the whole point of the visit.
	 * A view decision, so it is made by the view and passed in.
	 */
	atBottom?: boolean;
}

/**
 * A conversation, and everything that happens to one.
 *
 * This used to live in the page, and grew there: 351 lines at the fork, 1434 by
 * the time reasoning traces, web search, compaction, personas called in with
 * `@`, notes and server-side runs had each added their wiring where the state
 * already happened to be. Nothing about that was wrong one commit at a time,
 * and all of it was wrong by the end, because a page is a thing you look at and
 * none of this is.
 *
 * The line drawn here is between the conversation and the screen showing it.
 * Sending a turn, following it, picking it back up after a reload, folding the
 * context away, calling a persona in: all of that is the conversation, and it is
 * here. Where the transcript is scrolled, which message is lit up, whether the
 * composer floats: that is the screen, and it stays in the page.
 *
 * The class holds no `$effect`. What has to be watched is watched by whoever
 * renders it, calling the methods below; that is what keeps this usable from a
 * second interface rather than only from the one it was extracted out of.
 */
export class Conversation implements RunSurface {
	session: Session = $state()!;
	editor: Editor = $state()!;

	/**
	 * The model by name, which is what the picker binds to.
	 *
	 * The name rather than the model, because the picker is a list of names and
	 * because a conversation can carry one that no longer resolves. `syncModel`
	 * turns it back into a model, or into nothing.
	 */
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

	/**
	 * Tracks the last system prompt we auto-resolved, so a model switch can update
	 * it, but we never overwrite a hand-edited or knowledge-based prompt.
	 */
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
			// Declared here rather than left undefined: it is bound into the streaming
			// article, and Svelte refuses `bind:` against a prop that has a fallback when
			// the bound value is undefined. Reattaching to a run in progress hit that
			// before the first turn had set it, and threw during render.
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
	 * The sampling this turn will actually use: the account's settings, with
	 * whatever this conversation says of its own laid over them.
	 *
	 * Resolved here at send time rather than copied into the conversation when it
	 * was created, so changing a number in Settings reaches every conversation
	 * that never disagreed. A conversation that did disagree keeps its own, which
	 * is the whole point of it having said so.
	 */
	get options(): SamplingOptions {
		return mergeSampling(this.#chatDefaults.current.sampling.value, this.session.options);
	}

	/**
	 * There has to be enough conversation for a summary to be worth a request:
	 * below a handful of messages, compacting costs more context than it frees.
	 */
	readonly canCompact = $derived(
		!this.isCompacting &&
			!this.editor.isCompletionInProgress &&
			messagesInContext(this.session.messages).length >= 4
	);

	/**
	 * Something to fold away, and nothing already running.
	 *
	 * A lower bar than compaction's: clearing costs no request and frees whatever
	 * is there, so one message is enough to be worth it.
	 */
	readonly canClear = $derived(
		!this.isCompacting &&
			!this.editor.isCompletionInProgress &&
			messagesInContext(this.session.messages).length > 0
	);

	/**
	 * The unanswered quick-choice awaiting input: shown docked above the composer
	 * (Claude-style) instead of inline, and skipped in the message list until answered.
	 */
	readonly pendingChoice = $derived.by(() => {
		if (this.editor.isCompletionInProgress) return null;
		const last = this.session.messages.at(-1);
		return last?.role === 'assistant' && last.choices && !last.choices.answered ? last : null;
	});

	// --- opening, and what that means ------------------------------------------

	/**
	 * Point this at a conversation, whichever one was there before.
	 *
	 * Opening another conversation reuses whatever is rendering this one, so what
	 * was on screen for the last one has to be put down explicitly. Without it the
	 * streaming article of the conversation you just left is the first thing the
	 * next one shows, and the run being followed is the wrong conversation's.
	 *
	 * The entry point is handed in rather than read here: a prompt in the address
	 * bar is the router's business, and a message composed on the home page is the
	 * home page's. What the conversation does about either is this method.
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
		if (entry.atBottom !== false) void this.#view.scrollToBottom();

		// A persona conversation carries its own web-search preference.
		const boundPersona = this.session.personaId
			? this.#personas.current.find((p) => p.id === this.session.personaId)
			: null;
		if (boundPersona) {
			this.editor.webSearch = this.searchAvailable && !!boundPersona.webSearch;
			// Heal the model if it wasn't resolvable when the conversation was created
			// (e.g. an imported persona whose model was mapped afterwards).
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

		// Whatever was left in the composer last time. After the two hand-offs above
		// and never before them: they arrive with something to send right now, and a
		// draft is what you had not decided to send yet.
		this.editor.prompt = readDraft(sessionDraft(this.session.id));

		// The reason any of this exists: a turn that was still going when the page
		// went away is picked back up here, transcript and all.
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
		// Carry over the composer tool switches set on the home page (undefined →
		// keep the session defaults already assigned above).
		if (pending.thinking !== undefined) this.editor.thinking = pending.thinking;
		if (pending.interactiveChoices !== undefined)
			this.editor.interactiveChoices = pending.interactiveChoices;
		if (pending.sendCurrentDate !== undefined)
			this.editor.sendCurrentDate = pending.sendCurrentDate;

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

	/**
	 * Remember what is in the composer, for this conversation.
	 *
	 * Called by whoever draws it rather than watched from here, so this class keeps
	 * no effects of its own and a second interface can wire it its own way.
	 */
	rememberDraft = (): void => {
		writeDraft(sessionDraft(this.session.id), this.editor.prompt ?? '');
	};

	/**
	 * Resolve the picked name into the conversation's model.
	 *
	 * Reads both of the things it depends on, so whoever watches it is watching a
	 * plain call rather than having to know what it looks at.
	 */
	syncModel = (): void => {
		this.session.model = this.#settings.current.models.find((m) => m.name === this.modelName);
	};

	/** Re-resolve the system prompt when the model changes (new/unedited sessions). */
	autoResolveSystemPrompt = (): void => {
		if (this.session.systemPromptEdited) return;
		if (this.session.messages.some((m) => m.role === 'assistant')) return; // conversation already started
		const current = this.session.systemPrompt.content;
		if (current && current !== this.#lastAutoSystemPrompt) return; // manual / knowledge content: leave it
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
		// Sent is no longer a draft. Dropped here rather than after the turn, because
		// the message is already on its way and the composer is already empty.
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
		// Written before the turn goes out, not after it comes back.
		//
		// The conversation used to reach storage only when a reply landed, which is
		// the same write and so covers both messages at once. The hole is the turn
		// that never produces one: a reload, a crash, a closed tab or a failure
		// between sending and answering took the message with it, and no refresh
		// brought it back because it had never been written. What you typed and sent
		// is yours from the moment you send it.
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

		// Same reason as a new message: the edit is what you meant to say, and the
		// messages after it are already gone from the array above.
		this.save();
		await this.complete(this.session.messages);
	}

	/** A quick-choice selection becomes a normal user message (no tool_result). */
	choose = (text: string): void => {
		if (!text || this.editor.isCompletionInProgress) return;
		this.editor.prompt = text;
		this.submit();
	};

	/**
	 * Lock the picked option(s) onto the message (so reload renders them) and send
	 * the selection as a normal user message. Shared by the inline bubble and the
	 * docked panel above the composer.
	 */
	answerChoice = (message: Message, selected: string[][]): void => {
		if (!message.choices || message.choices.answered) return;
		const text = formatAskAnswer(message.choices.questions, selected);
		if (!text) return;
		message.choices = { ...message.choices, answered: true, selected };
		this.save();
		this.choose(text);
	};

	retry = async (index: number): Promise<void> => {
		// Remove all the messages after the index
		this.session.messages = this.session.messages.slice(0, index);

		const mostRecentUserMessage = this.session.messages.filter((m) => m.role === 'user').at(-1);
		if (!mostRecentUserMessage) throw new Error('No user message to retry');

		await this.complete(this.session.messages);
	};

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
	#speakersFor(messages: Message[]): RunSpeaker[] | undefined {
		const lastUser = [...messages].reverse().find((m) => m.role === 'user' && !m.knowledge);
		if (!lastUser?.content) return undefined;

		const named = mentionedPersonas(lastUser.content, this.#personas.current ?? []);
		if (!named.length) return undefined;

		const speakers: RunSpeaker[] = [];

		for (const persona of named) {
			// Its own model, and the conversation's when it names one nobody has. A
			// persona that cannot answer at all would be worse than one answering on
			// the model in front of it.
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
					// Its own capabilities, not the composer's: the toggles above the input
					// belong to the conversation's assistant, and a persona that searches
					// the web searches the web wherever it is asked to speak.
					webSearch: !!persona.webSearch,
					webFetch: !!this.editor.webFetch,
					interactiveChoices: !!this.editor.interactiveChoices,
					sendCurrentDate: !!this.editor.sendCurrentDate,
					nativeTools: this.#settings.current.nativeTools,
					webSearchAuto: this.#settings.current.webSearchAuto
				},
				capabilities: { search: this.searchAvailable, fetch: this.#webFetch.current.available }
			});
		}

		return speakers.length ? speakers : undefined;
	}

	/**
	 * Send a turn and follow it.
	 *
	 * Everything that used to happen inline here now happens in the orchestrator,
	 * which is what lets the same turn run in a process that outlives this page.
	 * What is left is this half of the job: settle what the turn is, hand it over,
	 * and apply what comes back.
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

		// The server writes the title and the summary itself, so it has to be told
		// which model to use for each: the browser is where that configuration lives.
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
			// The server reads the conversation to write into it, so everything this
			// tab has to say about it has to have landed first. Ordinary saves are
			// coalesced a moment at a time, which is right for an edit and wrong for
			// the message the turn is about to answer.
			await repository.flush?.();
			const run = await startRun(input);
			await this.#follow(run.id, 0);
		} catch (error) {
			// The handover failed, so there is no turn: nothing was started, and this
			// tab has nowhere to run one. Said plainly rather than worked around,
			// because the workaround used to be a second way of producing an answer,
			// and the message is still in the conversation and still in the composer.
			this.#handleError(error instanceof Error ? error : new Error(String(error)));
		}
	}

	/**
	 * Which connection serves a model chosen for an errand.
	 *
	 * A named connection wins, and the catalogue answers when there is none: these
	 * settings store a model by name alone, so the connection has to be looked up
	 * rather than assumed. It used to fall back to the conversation's own server,
	 * which is right only while every model lives on one connection. Point the
	 * title model at a hosted provider, hold the conversation on a local Ollama,
	 * and every turn asked that Ollama for a model it has never heard of. The 404
	 * went nowhere: naming is best-effort, so the conversation simply stayed
	 * untitled and nothing said why.
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
			// Named rather than described: the instance resolves the address and the
			// key from its own database, and a browser never holds either.
			serverId: server.id,
			model: this.session.model!.name,
			options: this.options,
			think: this.editor.thinking !== false,
			// The playbooks in force are appended to the conversation's own prompt
			// rather than replacing it: a procedure says how a job is done, not who is
			// doing it, and it has to sit under whatever instructions were already
			// there. Resolved at send time, so editing a playbook reaches every
			// conversation running it without anyone reattaching anything.
			systemPrompt:
				[
					this.session.systemPrompt.content,
					playbookInstructions(playbooksOf(this.session.playbookIds))
				]
					.filter((part) => part?.trim())
					.join('\n\n') || undefined,
			// Only so the turn can find what this persona remembers about this
			// account. Everything else about the persona is already resolved into the
			// fields above, which is deliberate and stays that way.
			personaId: this.session.personaId,
			// Compaction acts here and nowhere else: the conversation keeps every
			// message it ever had, and only what leaves for the model is cut back to
			// the last summary. Without a marker this returns the array untouched,
			// which is what every conversation written before compaction existed gets.
			messages: messagesInContext(messages),
			flags: {
				webSearch: !!this.editor.webSearch,
				webFetch: !!this.editor.webFetch,
				interactiveChoices: !!this.editor.interactiveChoices,
				sendCurrentDate: !!this.editor.sendCurrentDate,
				nativeTools: settings.nativeTools,
				webSearchAuto: settings.webSearchAuto
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
	 * What this turn should leave behind, asked before it goes out.
	 *
	 * Both are about the state it will end in: a conversation with no assistant
	 * message yet is the one about to earn a name, and automatic compaction is due
	 * once this answer has landed rather than before it does.
	 *
	 * The title, twice, and the second is the interesting one. The first is
	 * written before anything has been answered, so it names the question rather
	 * than the conversation; a few exchanges later there is something to name.
	 * Once, though, and never over a name someone typed. A conversation whose name
	 * keeps changing is worse than one badly named, and a title you chose being
	 * quietly replaced is worse than either.
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

	/**
	 * Watch a server-side run and apply what it sends.
	 *
	 * The same reducer the local path uses, from the same events, which is what
	 * makes reattaching after a reload identical to having watched it all along.
	 */
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
				// The run has already stored what these three changed, and the lists
				// around the conversation are drawn from a summary this tab holds in
				// memory. Without this the sidebar keeps yesterday's snippet and the
				// name written mid-turn appears only after a reload.
				if (event.type === 'message' || event.type === 'title' || event.type === 'compaction') {
					sessionsStore.reflect(this.session);
				}
			},
			{
				replayThrough,
				// The backlog lands in one flush, so there is exactly one place the
				// conversation should be: at the end of it. Following each fragment on
				// the way would be answering a question nobody asked, a hundred times.
				onCaughtUp: () => void this.#view.scrollToBottom(true)
			}
		);
		this.#stopFollowing = stop;

		try {
			await done;
		} finally {
			this.#stopFollowing = null;
			this.activeRun = null;
			// Stopped watching without the turn ending, which is what leaving the
			// conversation does: the composer is given back rather than left looking
			// like something is still arriving here.
			if (!ended) this.editor.isCompletionInProgress = false;
		}
	}

	/**
	 * Pick up a turn that was already running when this page loaded.
	 *
	 * Simpler than it was in the part that mattered: the note this browser used to
	 * keep in local storage, saying there might be an answer waiting somewhere, is
	 * gone. The run writes what it produces, so nothing is waiting anywhere. The
	 * server is asked instead, since it is the one running the turn and the only
	 * one that can say whether it still is.
	 *
	 * A run that has already ended is still followed, though, and that is not a
	 * leftover. The conversation was read from storage a moment before this, and a
	 * turn that landed inside that moment wrote itself into a row this page had
	 * already read: a reload two seconds before the last word arrived showed the
	 * question with no answer under it until the next visit. Replaying the log
	 * closes exactly that gap, and costs nothing now that replaying it stores
	 * nothing.
	 */
	async reattach(): Promise<void> {
		if (this.activeRun) return;

		const sessionId = this.session.id;
		const run = await runForSession(sessionId).catch(() => null);
		// The conversation may have changed under us while that was in flight.
		if (sessionId !== this.session.id) return;
		if (!run) return;

		// From zero, so a half-written answer is rebuilt as it stands rather than
		// picked up mid-sentence. What had already landed before this page opened is
		// applied as history rather than performed: on a local model at ten tokens a
		// second, a reply worth leaving the room for is not worth watching twice.
		// Anything the conversation already holds is recognised and skipped.
		await this.#follow(run.id, 0, run.lastEventId);
	}

	/**
	 * Stop watching, without stopping the turn.
	 *
	 * Leaving a server-side turn is not abandoning it: it keeps going and is
	 * waiting when the conversation is opened again.
	 */
	detach = (): void => {
		this.#stopFollowing?.();
		this.#stopFollowing = null;
	};

	/**
	 * Stop, and keep what was written.
	 *
	 * Only the abort: what to do with a half-written answer is the run's ending,
	 * and it is written down once in the reducer. Doing it here as well is how the
	 * same partial message used to be appended twice.
	 */
	stop = (): void => {
		this.editor.abortController?.abort();
		// A server-side turn does not hear an AbortController in this tab, so the
		// stop has to travel. What it wrote so far still comes back as an ending.
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
		 * A refusal is not a failure, and a toast is the wrong shape for it.
		 *
		 * A toast says "that did not work, try again", which is right when a server
		 * did not answer and wrong when somebody set a rule: trying again does the
		 * same thing. So a refusal stops the page and says who to ask.
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
	 * Draw a line and start again.
	 *
	 * Nothing is deleted. A marker is appended, everything before it folds under
	 * it, and the model is handed the conversation from that point on. Removing
	 * the marker gives all of it back, which is what makes this safe to reach for:
	 * it costs the model its memory of the exchange, and costs you nothing.
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
	 * Write down what the context holds, for the reader alone.
	 *
	 * A note like the others, so it folds into the conversation where it was
	 * asked for and survives a reload. The model never sees it: `messagesInContext`
	 * drops every note that is not the boundary, and its content is empty, which
	 * is also why it never turns up in a search.
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
	 * Open the playbook list here.
	 *
	 * One panel per conversation, moved to wherever it was last asked for rather
	 * than stacked. Two of them would show the same live state in two places, and
	 * only the lower one would be worth looking at. Nothing is lost by moving it:
	 * unlike every other note this one records nothing, it is a set of switches.
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
	 * Two messages, in the roles they were said in, with a framing on the question
	 * saying where it came from: without it the model reads a question it has no
	 * memory of being asked and starts explaining itself. The framing is an
	 * overridable prompt like every other, so it can be reworded without touching
	 * the code.
	 *
	 * The note keeps the exchange whatever happens here, so this adds and never
	 * moves: deleting the two messages afterwards leaves the record intact and the
	 * offer available again.
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
	 * Compact now, and say what happened.
	 *
	 * The waiting and the result are both drawn in the conversation, at the spot
	 * the boundary will land, so there is no success toast: the divider appearing
	 * is the confirmation. Failure still goes to a toast, because the user asked
	 * for the context to be shortened and if it was not, the next message goes out
	 * full-length: silently letting them believe otherwise is how a conversation
	 * hits a provider's wall.
	 */
	async compact(automatic = false, instruction = ''): Promise<boolean> {
		if (this.isCompacting) return false;
		this.isCompacting = true;
		this.#compactAbort = new AbortController();
		const signal = this.#compactAbort.signal;
		// The pill is the whole feedback now, so bring it into view before the wait
		// starts rather than after it ends.
		await this.#view.scrollToBottom(true, true);

		try {
			const { marker } = await compactSession(this.session, { automatic, signal, instruction });
			this.session.messages = [...this.session.messages, marker];
			this.session.updatedAt = new Date().toISOString();
			this.save();
			// Cleared in the same flush as the marker landing, so the pending pill and
			// the real one hand over to each other instead of one following the other.
			this.isCompacting = false;
			await this.#view.scrollToBottom(true);
			return true;
		} catch (error) {
			// An abandoned summary is not a failure: the user said stop, and the
			// conversation is exactly as they left it.
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
			// The menu hides it when there is nothing to fold, but the name can still
			// be typed in full, so the refusal lives here rather than only in the menu.
			if (!this.canClear) {
				toast.info(strings.nothingToClear());
				return;
			}
			this.clearContext();
			return;
		}
		if (name !== 'compact') return;
		// The menu hides `/compact` when there is nothing to compact, but the name
		// can still be typed in full, so the refusal lives here rather than only in
		// what the autocomplete offers.
		if (!this.canCompact) {
			toast.info(strings.nothingToCompact());
			return;
		}
		void this.compact(false, args);
	};
}
