<script lang="ts">
	import { CircleStop, LoaderCircle, UnfoldVertical } from '@lucide/svelte';
	import MessageSquareText from '@lucide/svelte/icons/message-square-text';
	import Settings_2 from '@lucide/svelte/icons/settings-2';
	import { toast } from 'svelte-sonner';

	import LL from '$i18n/i18n-svelte';
	import Button from '$lib/components/Button.svelte';
	import ButtonSubmit from '$lib/components/ButtonSubmit.svelte';
	import FieldTextEditor from '$lib/components/FieldTextEditor.svelte';
	import { ConnectionType } from '$lib/connections';
	import { serversStore } from '$lib/localStorage';
	import {
		imagesPayload,
		knowledgeContextMessage,
		type Attachment,
		type ImageAttachment,
		type KnowledgeAttachment
	} from '$lib/promptAttachments';
	import { searchConfig } from '$lib/search';
	import type { Editor, Session } from '$lib/sessions';
	import { generateRandomId } from '$lib/utils';

	import PromptAttachments from './PromptAttachments.svelte';

	const searchAvailable = $derived($searchConfig.available);

	interface Props {
		editor: Editor;
		session: Session;
		handleSubmit: (images?: { data: string; filename: string }[]) => void;
		stopCompletion: () => void;
		scrollToBottom: (shouldForceScroll: boolean) => void;
	}

	let {
		editor = $bindable(),
		session = $bindable(),
		handleSubmit,
		stopCompletion,
		scrollToBottom
	}: Props = $props();

	let attachments: Attachment[] = $state([]);

	const isOllamaFamily = $derived(
		$serversStore.find((s) => s.id === session.model?.serverId)?.connectionType ===
			ConnectionType.Ollama
	);

	// Persona chats keep the composer minimal — no parameters/controls tab and no
	// expand-to-code-editor toggle.
	const isPersona = $derived(!!session.personaId);

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
	class="prompt-editor sticky bottom-0 z-10 mx-auto flex w-full flex-col border-t bg-shade-1 p-3 md:p-4 lg:p-6 2xl:max-w-[80ch] 2xl:rounded-t-lg 2xl:border-l 2xl:border-r {editor.isCodeEditor
		? 'prompt-editor--fullscreen min-h-[60dvh] md:min-h-[75dvh]'
		: ''}"
>
	<div class="prompt-editor__form flex h-full min-h-0 flex-col gap-y-2">
		{#if !isPersona}
			<div class="flex items-center justify-end gap-x-2">
				<nav class="segmented-nav flex items-center rounded bg-shade-2 p-0.5">
					<div
						class="segmented-nav__button h-full rounded-sm text-shade-6 {editor.view === 'messages'
							? 'segmented-nav__button--active bg-shade-0 text-shade-0 shadow'
							: ''}"
					>
						<Button
							aria-label={$LL.messages()}
							variant="icon"
							onclick={switchToMessages}
							class="h-full"
							isActive={editor.view === 'messages'}
						>
							<MessageSquareText class="base-icon" />
						</Button>
					</div>
					<div
						class="segmented-nav__button h-full rounded-sm text-shade-6 {editor.view === 'controls'
							? 'segmented-nav__button--active bg-shade-0 text-shade-0 shadow'
							: ''}"
					>
						<Button
							aria-label={$LL.controls()}
							variant="icon"
							onclick={switchToControls}
							class="h-full"
							isActive={editor.view === 'controls'}
						>
							<Settings_2 class="base-icon" />
						</Button>
					</div>
				</nav>

				<Button
					variant={editor.isCodeEditor ? 'default' : 'outline'}
					class="prompt-editor__toggle h-full"
					onclick={toggleCodeEditor}
				>
					<UnfoldVertical class="base-icon" />
				</Button>
			</div>
		{/if}

		{#if editor.isCodeEditor}
			<FieldTextEditor label={$LL.prompt()} handleSubmit={submit} bind:value={editor.prompt} />
		{:else}
			<div
				class="flex flex-col rounded-xl border border-shade-3 bg-shade-0 transition-colors focus-within:border-shade-6 focus-within:outline focus-within:outline-shade-2"
			>
				<textarea
					name="prompt"
					class="prompt-editor__textarea base-input min-h-14 max-h-48 resize-none px-3 pt-3"
					placeholder={$LL.promptPlaceholder()}
					bind:this={editor.promptTextarea}
					bind:value={editor.prompt}
					onkeydown={handleKeyDown}
					onpaste={handlePaste}
				></textarea>

				<PromptAttachments bind:attachments bind:webSearch={editor.webSearch} {searchAvailable}>
					{#snippet actions()}
						<div class="flex items-center gap-x-1">
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
</div>

<style lang="postcss">
	.prompt-editor__textarea {
		field-sizing: content;
		font-variant-ligatures: none;
	}
</style>
