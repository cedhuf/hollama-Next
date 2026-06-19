<script lang="ts">
	import { CircleStop, LoaderCircle, UnfoldVertical } from '@lucide/svelte';
	import Settings_2 from '@lucide/svelte/icons/settings-2';
	import { toast } from 'svelte-sonner';

	import LL from '$i18n/i18n-svelte';
	import Button from '$lib/components/Button.svelte';
	import ButtonSubmit from '$lib/components/ButtonSubmit.svelte';
	import FieldTextEditor from '$lib/components/FieldTextEditor.svelte';
	import { ConnectionType, supportsReasoningToggle } from '$lib/connections';
	import { serversStore } from '$lib/localStorage';
	import {
		imagesPayload,
		knowledgeContextMessage,
		type Attachment,
		type ImageAttachment,
		type KnowledgeAttachment
	} from '$lib/promptAttachments';
	import { searchConfig } from '$lib/search';
	import type { Editor, Message, Session } from '$lib/sessions';
	import { generateRandomId } from '$lib/utils';

	import AskChoicesCard from './AskChoicesCard.svelte';
	import PromptAttachments from './PromptAttachments.svelte';

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
	}

	let {
		editor = $bindable(),
		session = $bindable(),
		handleSubmit,
		stopCompletion,
		scrollToBottom,
		pendingChoice = null,
		chooseAnswer
	}: Props = $props();

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
	const isFloating = $derived(editor.view === 'messages' && !editor.isCodeEditor);

	// Per-conversation tool switches surfaced in the composer's lightning dropdown.
	const tools = $derived([
		...(searchAvailable
			? [
					{
						label: 'Web search',
						checked: !!editor.webSearch,
						onChange: (v: boolean) => (editor.webSearch = v)
					}
				]
			: []),
		{
			label: 'Interactive choices',
			checked: !!editor.interactiveChoices,
			onChange: (v: boolean) => (editor.interactiveChoices = v)
		},
		{
			label: 'Current date',
			checked: !!editor.sendCurrentDate,
			onChange: (v: boolean) => (editor.sendCurrentDate = v)
		},
		...(supportsReasoning
			? [
					{
						// On = auto (Ollama enables thinking only when the model supports it).
						// Off = never request reasoning.
						label: 'Reasoning',
						checked: editor.thinking !== false,
						onChange: (v: boolean) => (editor.thinking = v)
					}
				]
			: [])
	]);

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

	function toggleCodeEditor() {
		editor.isCodeEditor = !editor.isCodeEditor;
		editor.shouldFocusTextarea = !editor.isCodeEditor;
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
		if (event.shiftKey) return;
		if (event.key !== 'Enter') return;
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
		const knowledgeMessages = attachments
			.filter((a): a is KnowledgeAttachment => a.type === 'knowledge' && !!a.knowledge)
			.map((a) => knowledgeContextMessage(a.knowledge!));
		if (knowledgeMessages.length) {
			session.messages = [...session.messages, ...knowledgeMessages];
		}

		const images = imagesPayload(attachments);
		handleSubmit(images.length ? images : undefined);
		attachments = [];
	}
</script>

<div
	class="prompt-editor pointer-events-auto w-full px-4 pt-2 lg:px-6 xl:px-8 {editor.isCodeEditor
		? 'prompt-editor--fullscreen min-h-[60dvh] md:min-h-[75dvh]'
		: ''}"
>
	<div class="prompt-editor__form mx-auto flex h-full min-h-0 w-full max-w-[84ch] flex-col gap-y-2">
		{#if pendingChoice?.choices && editor.view === 'messages' && !editor.isCodeEditor && !choiceBypassed}
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
		{:else if editor.isCodeEditor}
			<FieldTextEditor label={$LL.prompt()} handleSubmit={submit} bind:value={editor.prompt} />
		{:else}
			<!-- Floating composer: translucent blurred card; controls live in the bottom row by Run. -->
			<div
				class="flex flex-col rounded-2xl border border-shade-3 bg-shade-0/80 shadow-lg backdrop-blur-xl transition-colors focus-within:border-shade-5"
			>
				<textarea
					name="prompt"
					class="prompt-editor__textarea base-input min-h-14 max-h-48 resize-none px-4 pt-3.5"
					placeholder={$LL.promptPlaceholder()}
					bind:this={editor.promptTextarea}
					bind:value={editor.prompt}
					onkeydown={handleKeyDown}
					onpaste={handlePaste}
					enterkeyhint="send"
					inputmode="text"
				></textarea>

				<PromptAttachments bind:attachments {tools}>
					{#snippet actions()}
						<div class="flex items-center gap-x-1">
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
									class="hidden lg:inline-flex"
									title={$LL.prompt()}
									isActive={editor.isCodeEditor}
									onclick={toggleCodeEditor}
								>
									<UnfoldVertical class="base-icon" />
								</Button>
							{/if}

							{#if editor.messageIndexToEdit !== null}
								<Button
									variant="outline"
									onclick={() => {
										editor.prompt = '';
										editor.messageIndexToEdit = null;
										editor.isCodeEditor = false;
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
									hasMetaKey={editor.isCodeEditor}
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
		field-sizing: content;
		font-variant-ligatures: none;
	}
</style>
