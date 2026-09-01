<script lang="ts">
	import { CircleStop, FoldVertical, LoaderCircle, Mic, UnfoldVertical } from '@lucide/svelte';
	import { tick } from 'svelte';

	import LL from '$i18n/i18n-svelte';
	import {
		commandPrefix,
		parseSlashCommand,
		unescapeSlash,
		type CommandName,
		type SlashCommand
	} from '$lib/chat/commands';
	import { mentionPrefix, splitMentions } from '$lib/chat/mentions';
	import { chatDefaultsConfig } from '$lib/chatDefaults';
	import { buildChatTools, toolLabels } from '$lib/chatTools';
	import Button from '$lib/components/Button.svelte';
	import ButtonSubmit from '$lib/components/ButtonSubmit.svelte';
	import ImageDrop from '$lib/components/ImageDrop.svelte';
	import { supportsReasoningToggle } from '$lib/connections';
	import { readPastedImages, warnRejected } from '$lib/imageFiles';
	import { personasStore, serversStore } from '$lib/localStorage';
	import { mcpConfig } from '$lib/mcpConfig';
	import type { Persona } from '$lib/personas';
	import { contextMessages, imagesPayload, type Attachment } from '$lib/promptAttachments';
	import { searchConfig } from '$lib/search';
	import type { Editor, Message, Session } from '$lib/sessions';
	import { isTouchPrimary } from '$lib/utils';
	import { VoiceRecorder } from '$lib/voice.svelte';
	import { webFetchConfig } from '$lib/webFetch';

	import AskChoicesCard from './AskChoicesCard.svelte';
	import ContextMeter from './ContextMeter.svelte';
	import MentionMenu from './MentionMenu.svelte';
	import PromptAttachments from './PromptAttachments.svelte';
	import SlashMenu from './SlashMenu.svelte';

	const searchAvailable = $derived($searchConfig.available);

	/** Both halves have to be true: switched on, and a model chosen to transcribe with. A microphone that fails on first press is worse than none. */
	const voiceCfg = $derived($chatDefaultsConfig.voice);
	const voiceReady = $derived(voiceCfg.voiceInput && !!voiceCfg.voiceModel);
	const voice = new VoiceRecorder();

	/** Dictated words join what is already typed: somebody who wrote half a sentence and spoke the rest meant both halves. */
	function dictate() {
		if (voice.state === 'recording') return voice.stop();
		if (voice.state === 'transcribing') return;
		void voice.start((text) => {
			const current = editor.prompt?.trim() ?? '';
			editor.prompt = current ? `${current} ${text}` : text;
		});
	}

	interface Props {
		editor: Editor;
		session: Session;
		handleSubmit: (images?: { data: string; filename: string }[]) => void;
		stopCompletion: () => void;
		scrollToBottom: (shouldForceScroll: boolean) => void;
		/** Pending quick-choice, docked above the composer until answered. */
		pendingChoice?: Message | null;
		chooseAnswer: (message: Message, selected: string[][]) => void;
		/** Runs a slash command instead of sending the text as a message. */
		runCommand: (name: CommandName, args: string) => void;
		/** Token ceiling the load meter measures against. */
		contextThreshold: number;
		/** False when there is nothing before the last line to fold away. */
		canClear: boolean;
		/** False while a compaction is already running, or when there is nothing to compact. */
		canCompact: boolean;
	}

	let {
		editor = $bindable(),
		session = $bindable(),
		handleSubmit,
		stopCompletion,
		scrollToBottom,
		pendingChoice = null,
		chooseAnswer,
		runCommand,
		contextThreshold,
		canCompact,
		canClear
	}: Props = $props();

	// --- slash commands -------------------------------------------------------

	const commands = $derived<SlashCommand[]>([
		{
			name: 'compact',
			description: $LL.compactCommandDescription(),
			available: canCompact,
			unavailableReason: canCompact ? undefined : $LL.nothingToCompact(),
			takesArgs: true,
			argsHint: $LL.compactArgsHint()
		},
		{
			name: 'clear',
			description: $LL.clearCommandDescription(),
			available: canClear,
			unavailableReason: canClear ? undefined : $LL.nothingToClear()
		},
		// Always available: there is always a context, and a report saying it is nearly
		// empty is a good answer.
		{ name: 'context', description: $LL.contextCommandDescription(), available: true },
		{
			name: 'playbooks',
			description: $LL.playbooksCommandDescription(),
			available: true
		}
	]);
	const knownCommands = $derived(commands.map((c) => ({ name: c.name, takesArgs: c.takesArgs })));

	// Open only while the prompt is a bare `/word`: after a space the user is
	// writing a message that starts with a slash, and an autocomplete floating over
	// it would be in the way.
	const prefix = $derived(commandPrefix(editor.prompt ?? ''));
	const matches = $derived(
		prefix === null ? [] : commands.filter((c) => c.name.startsWith(prefix))
	);
	const menuOpen = $derived(matches.length > 0 && !editor.isCompletionInProgress);

	/** Positions the arrows may land on: an unavailable command is listed, not chosen. */
	const selectable = $derived(
		matches.map((c, i) => (c.available ? i : -1)).filter((i) => i !== -1)
	);

	let selectedCommand = $state(0);
	$effect(() => {
		// Land on the first command that can run whenever the list changes; -1 when
		// none can, so Enter falls through.
		void matches.length;
		selectedCommand = selectable[0] ?? -1;
	});

	/** Moves the highlight by `step`, wrapping, over the selectable rows only. */
	function moveSelection(step: number) {
		if (!selectable.length) return;
		const at = selectable.indexOf(selectedCommand);
		const next = (at + step + selectable.length) % selectable.length;
		selectedCommand = selectable[next];
	}

	/** A command that takes arguments is written into the composer rather than run: picking it from a list means you were not going to type the name, and running it there would take away the moment to say anything. */
	function pickCommand(command: SlashCommand) {
		if (!command.available) return;
		editor.prompt = command.takesArgs ? `/${command.name} ` : `/${command.name}`;
		editor.promptTextarea?.focus();
		if (!command.takesArgs) submit();
	}

	// --- mentions -------------------------------------------------------------

	/**
	 * Calling a persona into this conversation with `@`. The twin of the slash menu,
	 * with the same keys; what differs is Enter, which inserts and lets you keep
	 * typing, because a mention is the start of a sentence rather than the whole of
	 * one. The caret is tracked, since a mention can be added mid-message.
	 */
	let caret = $state(0);

	function trackCaret() {
		caret = editor.promptTextarea?.selectionStart ?? (editor.prompt ?? '').length;
	}

	const mentionQuery = $derived(mentionPrefix(editor.prompt ?? '', caret));
	const mentionMatches = $derived.by(() => {
		if (mentionQuery === null) return [];
		const q = mentionQuery.trim().toLowerCase();
		const all = ($personasStore ?? []).filter((persona) => persona.name.trim());
		return (q ? all.filter((persona) => persona.name.toLowerCase().includes(q)) : all).slice(0, 8);
	});
	const mentionMenuOpen = $derived(
		mentionMatches.length > 0 && !editor.isCompletionInProgress && !menuOpen
	);

	let selectedMention = $state(0);
	$effect(() => {
		void mentionMatches.length;
		selectedMention = 0;
	});

	/** The prompt cut into plain runs and mentions, for the mirror behind the input. */
	const promptSegments = $derived(splitMentions(editor.prompt ?? '', $personasStore ?? []));

	/** A textarea keeps its blank last line and a box collapses it, so without this the mirror is one line short. A zero-width space is worse: it is a break opportunity, so it can move where the last line wraps. */
	const trailingPad = $derived((editor.prompt ?? '').endsWith('\n') ? ' ' : '');

	let mirror = $state<HTMLDivElement | undefined>();

	/** The mirror scrolls with the input, or a long prompt paints its pills adrift. */
	function syncMirror() {
		if (mirror && editor.promptTextarea) mirror.scrollTop = editor.promptTextarea.scrollTop;
	}

	function pickMention(persona: Persona) {
		const text = editor.prompt ?? '';
		const at = text.slice(0, caret).lastIndexOf('@');
		if (at === -1) return;

		// A trailing space, because a mention is almost never the end of the message.
		const inserted = `@${persona.name.trim()} `;
		editor.prompt = text.slice(0, at) + inserted + text.slice(caret);

		const position = at + inserted.length;
		const textarea = editor.promptTextarea;
		textarea?.focus();
		// After the value is written, or the caret lands where the old text put it.
		tick().then(() => {
			textarea?.setSelectionRange(position, position);
			caret = position;
		});
	}

	let attachments: Attachment[] = $state([]);

	// The quick-choice card takes over the composer; dismissing falls back to free
	// typing. A fresh pending choice re-arms it.
	let choiceBypassed = $state(false);
	$effect(() => {
		void pendingChoice;
		choiceBypassed = false;
	});

	const supportsReasoning = $derived.by(() => {
		const ct = $serversStore.find((s) => s.id === session.model?.serverId)?.connectionType;
		return ct !== undefined && supportsReasoningToggle(ct);
	});

	// Persona chats keep the composer minimal: no controls tab, no expand toggle.
	const isPersona = $derived(!!session.personaId);

	// Per-conversation tool switches surfaced in the composer's lightning dropdown.
	const tools = $derived(
		buildChatTools(
			{
				webSearch: !!editor.webSearch,
				webFetch: !!editor.webFetch,
				interactiveChoices: !!editor.interactiveChoices,
				sendCurrentDate: !!editor.sendCurrentDate,
				// Off = never request reasoning; on = auto.
				thinking: editor.thinking !== false,
				mcp: editor.mcp !== false
			},
			(key, value) => (editor[key] = value),
			{
				webSearch: searchAvailable,
				webFetch: $webFetchConfig.available,
				reasoning: supportsReasoning,
				mcp: $mcpConfig.hasServers
			},
			toolLabels($LL)
		)
	);

	$effect(() => {
		if (attachments.length) scrollToBottom(true);
	});

	$effect(() => {
		if (editor.messageIndexToEdit !== null && editor.attachments) {
			attachments = [...editor.attachments];
		}
	});

	function toggleExpanded() {
		editor.isExpanded = !editor.isExpanded;
		editor.promptTextarea?.focus();
	}

	function handleKeyDown(event: KeyboardEvent) {
		// The command menu takes the arrows, Tab and Escape while open, and Enter picks
		// the highlighted command rather than sending `/comp` as text. The mention menu
		// takes the same keys, and only one is ever open.
		if (mentionMenuOpen) {
			if (event.key === 'ArrowDown' || (event.key === 'Tab' && !event.shiftKey)) {
				event.preventDefault();
				selectedMention = (selectedMention + 1) % mentionMatches.length;
				return;
			}
			if (event.key === 'ArrowUp' || (event.key === 'Tab' && event.shiftKey)) {
				event.preventDefault();
				selectedMention = (selectedMention - 1 + mentionMatches.length) % mentionMatches.length;
				return;
			}
			if (event.key === 'Escape') {
				event.preventDefault();
				// Closing without losing what was typed: the `@` stays as the ordinary
				// character it is, and moving the caret past it shuts the menu.
				caret = -1;
				return;
			}
			if (event.key === 'Enter' && !event.shiftKey) {
				event.preventDefault();
				pickMention(mentionMatches[selectedMention]);
				return;
			}
		}

		if (menuOpen) {
			if (event.key === 'ArrowDown' || (event.key === 'Tab' && !event.shiftKey)) {
				event.preventDefault();
				moveSelection(1);
				return;
			}
			if (event.key === 'ArrowUp' || (event.key === 'Tab' && event.shiftKey)) {
				event.preventDefault();
				moveSelection(-1);
				return;
			}
			if (event.key === 'Escape') {
				event.preventDefault();
				editor.prompt = '';
				return;
			}
			if (event.key === 'Enter' && !event.shiftKey && selectedCommand >= 0) {
				event.preventDefault();
				pickCommand(matches[selectedCommand]);
				return;
			}
		}

		if (event.key !== 'Enter') return;

		// Expanded is long-form: Enter breaks the line and Cmd/Ctrl+Enter sends, so
		// paragraphs can be written without the composer firing on every return.
		if (editor.isExpanded) {
			if (!event.metaKey && !event.ctrlKey) return;
			event.preventDefault();
			submit();
			return;
		}

		if (event.shiftKey) return;
		event.preventDefault();
		submit();
	}

	async function handlePaste(event: ClipboardEvent) {
		const data = event.clipboardData;
		if (!data) return;
		if (!Array.from(data.items).some((item) => item.type.startsWith('image/'))) return;

		// Only once there is a picture in it: a plain text paste is still a paste.
		event.preventDefault();

		const { images, rejected } = await readPastedImages(data);
		warnRejected(rejected);
		if (images.length) attachments = [...attachments, ...images];
	}

	function submit() {
		// The message is gone, so the keyboard is covering the answer about to arrive.
		// Only on touch: on a laptop the next thing anyone does is type.
		if (isTouchPrimary()) editor.promptTextarea?.blur();

		// A recognised command never becomes a message. Anything else, an unknown
		// `/word` included, is sent as typed, minus the `//` escape.
		const command = parseSlashCommand(editor.prompt ?? '', knownCommands);
		if (command) {
			editor.prompt = '';
			runCommand(command.name, command.args);
			return;
		}
		editor.prompt = unescapeSlash(editor.prompt ?? '');

		const context = contextMessages(attachments);
		if (context.length) session.messages = [...session.messages, ...context];

		const images = imagesPayload(attachments);
		handleSubmit(images.length ? images : undefined);
		attachments = [];
	}
</script>

<div
	class="prompt-editor pointer-events-auto w-full px-4 pt-2 pb-[max(1rem,var(--safe-bottom))] lg:px-6 lg:pb-4 xl:px-8 {editor.isExpanded
		? 'prompt-editor--fullscreen'
		: ''}"
>
	<div class="prompt-editor__form mx-auto flex h-full min-h-0 w-full max-w-[84ch] flex-col gap-y-2">
		{#if pendingChoice?.choices && !editor.isExpanded && !choiceBypassed}
			{@const choice = pendingChoice}
			<!-- A quick-choice temporarily takes over the composer: one question at a time,
			     numbered and scrollable, dismissable to type freely. -->
			{#key choice}
				<AskChoicesCard
					choices={choice.choices!}
					onChoose={(selected) => chooseAnswer(choice, selected)}
					onDismiss={() => (choiceBypassed = true)}
					disabled={editor.isCompletionInProgress}
				/>
			{/key}
		{:else}
			{#if mentionMenuOpen}
				<MentionMenu
					personas={mentionMatches}
					selected={selectedMention}
					onPick={pickMention}
					onHover={(i) => (selectedMention = i)}
				/>
			{/if}
			{#if menuOpen}
				<!-- Above the composer, not over it: the text being typed is what the list is
				     filtered on. -->
				<SlashMenu
					commands={matches}
					selected={selectedCommand}
					onPick={pickCommand}
					onHover={(i) => (selectedCommand = i)}
				/>
			{/if}
			<!-- One composer, always: expanding only grows the card, so every control stays
			     reachable in every state. -->
			<ImageDrop
				label={$LL.dropImagesHere()}
				onImages={(images) => (attachments = [...attachments, ...images])}
				class="surface-floating border-shade-3 focus-within:border-shade-5 flex flex-col rounded-2xl border shadow-lg transition-colors"
			>
				<!-- The textarea auto-grows (field-sizing); expanding raises its floor and
				     ceiling, so there is no flex-height chain to depend on. -->
				<!-- A mention is drawn as a label and a textarea cannot hold one, so the pill is
				     painted behind the text: a mirror with the same font, padding and wrapping
				     renders the prompt, and the textarea sits on top with transparent text and a
				     visible caret.

				     Which is why the highlight has no weight, size or border of its own. Anything
				     that changed a glyph's metrics would move the mirror out from under the real
				     text, a character further with every line. -->
				<div class="relative">
					<div
						bind:this={mirror}
						aria-hidden="true"
						class="prompt-editor__mirror prompt-editor__textarea base-input pointer-events-none absolute inset-0 px-4 pt-3.5"
					>
						<!-- Written on one line, and it has to stay on one line: the mirror renders with
						     `pre-wrap`, so the newlines between these tags are characters, and every
						     segment pushed the next one along. -->
						<!-- prettier-ignore -->
						{#each promptSegments as segment, i (i)}{#if segment.kind === 'mention'}<span class="prompt-editor__mention">{segment.text}</span>{:else}{segment.text}{/if}{/each}{trailingPad}
					</div>

					<textarea
						name="prompt"
						class="prompt-editor__textarea prompt-editor__input base-input relative resize-none px-4 pt-3.5 {editor.isExpanded
							? 'max-h-[70dvh] min-h-[52dvh]'
							: 'max-h-[40dvh] min-h-14'}"
						placeholder={$LL.promptPlaceholder()}
						bind:this={editor.promptTextarea}
						bind:value={editor.prompt}
						onkeydown={handleKeyDown}
						onkeyup={trackCaret}
						onclick={trackCaret}
						oninput={trackCaret}
						onselect={trackCaret}
						onscroll={syncMirror}
						onpaste={handlePaste}
						enterkeyhint={editor.isExpanded ? 'enter' : 'send'}
						inputmode="text"></textarea>
				</div>

				<PromptAttachments bind:attachments {tools}>
					{#snippet actions()}
						<div class="flex items-center gap-x-1">
							{#if session.messages.length}
								<ContextMeter {session} threshold={contextThreshold} />
							{/if}
							{#if !isPersona}
								<Button
									variant="icon"
									class="prompt-editor__toggle hidden lg:inline-flex"
									title={editor.isExpanded ? $LL.collapsePrompt() : $LL.expandPrompt()}
									aria-label={editor.isExpanded ? $LL.collapsePrompt() : $LL.expandPrompt()}
									aria-expanded={editor.isExpanded}
									isActive={editor.isExpanded}
									onclick={toggleExpanded}
								>
									{#if editor.isExpanded}
										<FoldVertical class="base-icon" />
									{:else}
										<UnfoldVertical class="base-icon" />
									{/if}
								</Button>
							{/if}

							{#if editor.messageIndexToEdit !== null}
								<Button
									variant="outline"
									onclick={() => {
										editor.prompt = '';
										editor.messageIndexToEdit = null;
										editor.isExpanded = false;
									}}
								>
									{$LL.cancel()}
								</Button>
							{/if}

							{#if voiceReady}
								<!-- Dictation, beside the controls that act on what is in the field rather than
								     out with the attachments: it writes into the composer, it does not send. -->
								<Button
									variant="icon"
									class={voice.state === 'recording' ? 'text-accent' : ''}
									title={voice.state === 'transcribing'
										? $LL.voiceTranscribing()
										: $LL.voiceInput()}
									aria-label={$LL.voiceInput()}
									aria-pressed={voice.state === 'recording'}
									disabled={voice.state === 'transcribing'}
									onclick={dictate}
								>
									{#if voice.state === 'transcribing'}
										<LoaderCircle class="base-icon animate-spin" />
									{:else}
										<Mic class="base-icon {voice.state === 'recording' ? 'animate-pulse' : ''}" />
									{/if}
								</Button>
							{/if}

							{#if editor.isCompletionInProgress}
								<Button title={$LL.stopCompletion()} variant="outline" onclick={stopCompletion}>
									<div class="prompt-editor__stop relative -mx-3 -my-2 h-9 w-9">
										<span
											class="prompt-editor__stop-icon absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 opacity-0 hover:opacity-100"
										>
											<CircleStop class="base-icon" />
										</span>
										<span
											class="prompt-editor__loading-icon absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 opacity-100 hover:opacity-0"
										>
											<LoaderCircle class="prompt-editor__loading-icon base-icon animate-spin" />
										</span>
									</div>
								</Button>
							{:else}
								<ButtonSubmit
									handleSubmit={submit}
									hasMetaKey={editor.isExpanded}
									disabled={(!editor.prompt &&
										!attachments.filter((a) => a.type === 'image').length) ||
										!session.model ||
										editor.isCompletionInProgress}
								>
									{$LL.run()}
								</ButtonSubmit>
							{/if}
						</div>
					{/snippet}
				</PromptAttachments>
			</ImageDrop>
		{/if}
	</div>
</div>

<style lang="postcss">
	.prompt-editor__textarea {
		/* Grows with what's typed, bounded by min/max-height: no manual resize needed. */
		field-sizing: content;
		font-variant-ligatures: none;
	}

	/* Everything that decides where a glyph lands is shared between the two.
	   `white-space` and `overflow-wrap` are stated because a div and a textarea do
	   not wrap the same way by default. */
	.prompt-editor__mirror,
	.prompt-editor__input {
		white-space: pre-wrap;
		overflow-wrap: break-word;
		word-break: normal;
		tab-size: 4;
		/* Reserved on both, always, so the two never wrap at different widths: without
		   it the textarea takes a gutter the moment it overflows and the mirror does
		   not. */
		scrollbar-gutter: stable;
	}

	/* The mirror is what is read, so it carries the theme's ink; the textarea on top
	   keeps its caret and its selection.

	   `display: block` is not a detail: it borrows `base-input` for the same padding
	   as the textarea, and `base-input` is a flex container. Laid out as flex, every
	   mention became a flex item and the whitespace between them was dropped.

	   `overflow-y: auto` rather than hidden, so a long prompt reserves the same
	   scrollbar gutter the textarea does and both wrap at the same width. */
	.prompt-editor__mirror {
		display: block;
		overflow-y: auto;
		color: var(--color-active);
	}

	.prompt-editor__input {
		color: transparent;
		background: transparent;
		caret-color: var(--color-active);
	}

	.prompt-editor__input::selection {
		/* A selection over transparent text would be an empty band, so it paints its own
		   ink for the length of the highlight. */
		color: var(--color-active);
	}

	/* Colour alone, and not only for taste: anything with a box around it is a
	   rectangle drawn under a moving caret, and it looks like a mistake at every
	   position but one. Colour also changes no metric. */
	.prompt-editor__mention {
		color: var(--color-accent);
	}
</style>
