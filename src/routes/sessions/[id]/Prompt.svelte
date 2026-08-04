<script lang="ts">
	import { CircleStop, FoldVertical, LoaderCircle, UnfoldVertical } from '@lucide/svelte';
	import Settings_2 from '@lucide/svelte/icons/settings-2';
	import { toast } from 'svelte-sonner';

	import LL from '$i18n/i18n-svelte';
	import {
		commandPrefix,
		parseSlashCommand,
		unescapeSlash,
		type CommandName,
		type SlashCommand
	} from '$lib/chat/commands';
	import { buildChatTools, toolLabels } from '$lib/chatTools';
	import Button from '$lib/components/Button.svelte';
	import ButtonSubmit from '$lib/components/ButtonSubmit.svelte';
	import { ConnectionType, supportsReasoningToggle } from '$lib/connections';
	import { serversStore } from '$lib/localStorage';
	import {
		contextMessages,
		imagesPayload,
		type Attachment,
		type ImageAttachment
	} from '$lib/promptAttachments';
	import { searchConfig } from '$lib/search';
	import type { Editor, Message, Session } from '$lib/sessions';
	import { generateRandomId } from '$lib/utils';
	import { webFetchConfig } from '$lib/webFetch';

	import AskChoicesCard from './AskChoicesCard.svelte';
	import ContextMeter from './ContextMeter.svelte';
	import PromptAttachments from './PromptAttachments.svelte';
	import SlashMenu from './SlashMenu.svelte';

	const searchAvailable = $derived($searchConfig.available);

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
		canCompact
	}: Props = $props();

	// --- slash commands -------------------------------------------------------

	const commands = $derived<SlashCommand[]>([
		{
			name: 'compact',
			description: $LL.compactCommandDescription(),
			available: canCompact,
			unavailableReason: canCompact ? undefined : $LL.nothingToCompact()
		}
	]);
	const knownCommands = $derived(commands.map((c) => c.name));

	// The menu is open only while the prompt is a bare `/word`: as soon as a space
	// or a newline is typed, the user is writing a message that starts with a
	// slash, and an autocomplete floating over it would be in the way.
	const prefix = $derived(commandPrefix(editor.prompt ?? ''));
	const matches = $derived(
		prefix === null ? [] : commands.filter((c) => c.name.startsWith(prefix))
	);
	const menuOpen = $derived(matches.length > 0 && !editor.isCompletionInProgress);

	/** Positions the arrows may land on — an unavailable command is listed, not chosen. */
	const selectable = $derived(
		matches.map((c, i) => (c.available ? i : -1)).filter((i) => i !== -1)
	);

	let selectedCommand = $state(0);
	$effect(() => {
		// Land on the first command that can actually run whenever the list changes
		// under the highlight; -1 when none can, so Enter falls through.
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

	function pickCommand(command: SlashCommand) {
		if (!command.available) return;
		editor.prompt = `/${command.name}`;
		editor.promptTextarea?.focus();
		submit();
	}

	let attachments: Attachment[] = $state([]);

	// The quick-choice card takes over the composer; dismissing (✕) falls back to free
	// typing for the current choice. A fresh (or cleared) pending choice re-arms the card.
	let choiceBypassed = $state(false);
	$effect(() => {
		void pendingChoice;
		choiceBypassed = false;
	});

	const isOllamaFamily = $derived(
		$serversStore.find((s) => s.id === session.model?.serverId)?.connectionType ===
			ConnectionType.Ollama
	);

	const supportsReasoning = $derived.by(() => {
		const ct = $serversStore.find((s) => s.id === session.model?.serverId)?.connectionType;
		return ct !== undefined && supportsReasoningToggle(ct);
	});

	// Persona chats keep the composer minimal — no parameters/controls tab and no
	// expand-to-code-editor toggle.
	const isPersona = $derived(!!session.personaId);

	// In the plain chat view the composer floats over the messages; the strip below
	// it stays opaque so scrolling text never peeks under the input.
	const isFloating = $derived(editor.view === 'messages' && !editor.isExpanded);

	// Per-conversation tool switches surfaced in the composer's lightning dropdown.
	const tools = $derived(
		buildChatTools(
			{
				webSearch: !!editor.webSearch,
				webFetch: !!editor.webFetch,
				interactiveChoices: !!editor.interactiveChoices,
				sendCurrentDate: !!editor.sendCurrentDate,
				// Off = never request reasoning; on = auto.
				thinking: editor.thinking !== false
			},
			(key, value) => (editor[key] = value),
			{
				webSearch: searchAvailable,
				webFetch: $webFetchConfig.available,
				reasoning: supportsReasoning
			},
			toolLabels($LL)
		)
	);

	function toggleControls() {
		if (editor.view === 'controls') switchToMessages();
		else switchToControls();
	}

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

	function switchToMessages() {
		editor.view = 'messages';
		scrollToBottom(true);
	}

	function switchToControls() {
		if (!isOllamaFamily) {
			toast.warning($LL.controlsOnlyAvailableForOllama());
			return;
		}
		editor.view = 'controls';
	}

	function handleKeyDown(event: KeyboardEvent) {
		// The command menu takes the arrows, Tab and Escape while it is open, and
		// Enter picks the highlighted command rather than sending `/comp` as text.
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

		// Expanded is the long-form mode: Enter breaks the line and ⌘/Ctrl+Enter sends,
		// so paragraphs can be written without the composer firing on every return.
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

	function handlePaste(event: ClipboardEvent) {
		const clipboardData = event.clipboardData;
		if (!clipboardData) return;

		const items = Array.from(clipboardData.items);
		const imageItems = items.filter((item) => item.type.startsWith('image/'));

		if (imageItems.length === 0) return;

		// Prevent default paste behavior when images are detected
		event.preventDefault();

		const allowedTypes = ['image/png', 'image/jpeg'];
		const newAttachments: ImageAttachment[] = [];
		let unsupportedFiles = false;

		const imagePromises = imageItems.map((item, index) => {
			return new Promise<void>((resolve) => {
				if (!allowedTypes.includes(item.type)) {
					unsupportedFiles = true;
					resolve();
					return;
				}

				const file = item.getAsFile();
				if (!file) {
					resolve();
					return;
				}

				const reader = new FileReader();
				reader.onload = (event) => {
					const dataUrl = event.target?.result as string;
					if (dataUrl) {
						// Generate a filename based on timestamp and index
						const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
						const extension = item.type === 'image/png' ? 'png' : 'jpg';
						const filename = `pasted-image-${timestamp}-${index + 1}.${extension}`;

						newAttachments.push({
							type: 'image',
							id: generateRandomId(),
							name: filename,
							dataUrl
						});
					}
					resolve();
				};
				reader.onerror = () => {
					console.error('Error reading pasted image');
					resolve();
				};
				reader.readAsDataURL(file);
			});
		});

		Promise.all(imagePromises).then(() => {
			if (unsupportedFiles) {
				toast.warning('Some images were ignored. Only PNG and JPEG images are supported.');
			}
			if (newAttachments.length > 0) {
				attachments = [...attachments, ...newAttachments];
			}
		});
	}

	function submit() {
		// A recognised command never becomes a message: it runs, and the composer
		// clears. Anything else — including an unknown `/word` — is sent as typed,
		// minus the `//` escape for a message that really does start with a slash.
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
	class="prompt-editor pointer-events-auto w-full px-4 pt-2 lg:px-6 xl:px-8 {editor.isExpanded
		? 'prompt-editor--fullscreen'
		: ''}"
>
	<div class="prompt-editor__form mx-auto flex h-full min-h-0 w-full max-w-[84ch] flex-col gap-y-2">
		{#if pendingChoice?.choices && editor.view === 'messages' && !editor.isExpanded && !choiceBypassed}
			{@const choice = pendingChoice}
			<!-- Interactive quick-choice temporarily takes over the composer (Claude-style):
			     one question at a time, numbered + scrollable, dismiss (✕) to type freely. -->
			{#key choice}
				<AskChoicesCard
					choices={choice.choices!}
					onChoose={(selected) => chooseAnswer(choice, selected)}
					onDismiss={() => (choiceBypassed = true)}
					disabled={editor.isCompletionInProgress}
				/>
			{/key}
		{:else}
			{#if menuOpen}
				<!-- Above the composer, not over it: the text being typed is what the
				     list is filtered on, so it has to stay readable. -->
				<SlashMenu
					commands={matches}
					selected={selectedCommand}
					onPick={pickCommand}
					onHover={(i) => (selectedCommand = i)}
				/>
			{/if}
			<!-- One composer, always: expanding only grows the card, so the toggle, Run,
			     Cancel, attachments and tools stay reachable in every state. -->
			<div
				class="flex flex-col rounded-2xl border border-shade-3 bg-shade-0/80 shadow-lg backdrop-blur-xl transition-colors focus-within:border-shade-5"
			>
				<!-- The textarea auto-grows with its content (field-sizing); expanding only
				     raises its floor and ceiling, so no flex-height chain to depend on. -->
				<textarea
					name="prompt"
					class="prompt-editor__textarea base-input resize-none px-4 pt-3.5 {editor.isExpanded
						? 'min-h-[52dvh] max-h-[70dvh]'
						: 'min-h-14 max-h-[40dvh]'}"
					placeholder={$LL.promptPlaceholder()}
					bind:this={editor.promptTextarea}
					bind:value={editor.prompt}
					onkeydown={handleKeyDown}
					onpaste={handlePaste}
					enterkeyhint={editor.isExpanded ? 'enter' : 'send'}
					inputmode="text"
				></textarea>

				<PromptAttachments bind:attachments {tools}>
					{#snippet actions()}
						<div class="flex items-center gap-x-1">
							{#if session.messages.length}
								<ContextMeter {session} threshold={contextThreshold} />
							{/if}
							{#if !isPersona}
								<Button
									variant="icon"
									title={$LL.controls()}
									aria-label={$LL.controls()}
									isActive={editor.view === 'controls'}
									onclick={toggleControls}
								>
									<Settings_2 class="base-icon" />
								</Button>
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

							{#if editor.isCompletionInProgress}
								<Button title={$LL.stopCompletion()} variant="outline" onclick={stopCompletion}>
									<div class="prompt-editor__stop relative -mx-3 -my-2 h-9 w-9">
										<span
											class="prompt-editor__stop-icon absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 opacity-0 hover:opacity-100"
										>
											<CircleStop class="base-icon" />
										</span>
										<span
											class="prompt-editor__loading-icon absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 opacity-100 hover:opacity-0"
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
			</div>
		{/if}
	</div>
	{#if isFloating}
		<!-- Opaque strip in the conversation-card colour (shade-1): keeps a little breathing
		     room below the input while preventing scrolling text from peeking under it. Inset
		     (no full-bleed) so it never paints over the card's rounded bottom corners. -->
		<div class="h-3 bg-shade-1 md:h-4" aria-hidden="true"></div>
	{/if}
</div>

<style lang="postcss">
	.prompt-editor__textarea {
		/* Grows with what's typed, bounded by min/max-height — no manual resize needed. */
		field-sizing: content;
		font-variant-ligatures: none;
	}
</style>
