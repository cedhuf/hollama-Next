<script lang="ts">
	import { Brain, CircleStop, Image, LoaderCircle, UnfoldVertical } from '@lucide/svelte';
	import MessageSquareText from '@lucide/svelte/icons/message-square-text';
	import Settings_2 from '@lucide/svelte/icons/settings-2';
	import Trash_2 from '@lucide/svelte/icons/trash-2';
	import { toast } from 'svelte-sonner';

	import LL from '$i18n/i18n-svelte';
	import Button from '$lib/components/Button.svelte';
	import ButtonSubmit from '$lib/components/ButtonSubmit.svelte';
	import FieldTextEditor from '$lib/components/FieldTextEditor.svelte';
	import { ConnectionType } from '$lib/connections';
	import { loadKnowledge, type Knowledge } from '$lib/knowledge';
	import { knowledgeStore, serversStore } from '$lib/localStorage';
	import type { Editor, Message, Session } from '$lib/sessions';
	import { generateRandomId } from '$lib/utils';

	import AttachmentImage from './AttachmentImage.svelte';
	import KnowledgeSelect from './KnowledgeSelect.svelte';

	type KnowledgeAttachment = {
		type: 'knowledge';
		fieldId: string;
		knowledge?: Knowledge;
	};

	type ImageAttachment = {
		type: 'image';
		id: string;
		name: string;
		dataUrl: string;
	};

	type Attachment = KnowledgeAttachment | ImageAttachment;

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

	function handleSelectKnowledge(fieldId: string, knowledgeId: string) {
		attachments = attachments.map((a) =>
			a.type === 'knowledge' && a.fieldId === fieldId
				? { ...a, knowledge: loadKnowledge(knowledgeId) }
				: a
		);
	}

	function handleImageUploadClick() {
		const input = document.createElement('input');
		input.type = 'file';
		input.accept = '.png,.jpg,.jpeg,image/png,image/jpeg';
		input.multiple = true;
		input.onchange = (e) => {
			const files = (e.target as HTMLInputElement).files;
			if (!files || files.length === 0) return;

			const allowedTypes = ['image/png', 'image/jpeg'];
			const newAttachments: Attachment[] = [];
			let unsupportedFiles = false;

			const filePromises = Array.from(files).map((file) => {
				return new Promise<void>((resolve) => {
					if (!allowedTypes.includes(file.type)) {
						unsupportedFiles = true;
						resolve();
						return;
					}

					const reader = new FileReader();
					reader.onload = (event) => {
						const dataUrl = event.target?.result as string;
						if (dataUrl) {
							newAttachments.push({
								type: 'image',
								id: generateRandomId(),
								name: file.name,
								dataUrl
							});
						}
						resolve();
					};
					reader.onerror = () => {
						console.error('Error reading file:', file.name);
						resolve();
					};
					reader.readAsDataURL(file);
				});
			});

			Promise.all(filePromises).then(() => {
				if (unsupportedFiles) {
					toast.warning('Some files were ignored. Only PNG and JPEG images are supported.');
				}
				if (newAttachments.length > 0) {
					attachments = [...attachments, ...newAttachments];
				}
			});
		};
		input.click();
	}

	function handleDeleteAttachment(id: string) {
		attachments = [
			...attachments.filter((a) => (a.type === 'knowledge' ? a.fieldId : a.id) !== id)
		];
	}

	function submit() {
		const knowledgeAttachments = attachments.filter(
			(a): a is KnowledgeAttachment => a.type === 'knowledge'
		);
		if (knowledgeAttachments.length) {
			const knowledgeAttachmentMessages: Message[] = [];
			attachments.forEach((a) => {
				if (a.type === 'knowledge' && a.knowledge)
					knowledgeAttachmentMessages.push({
						role: 'user',
						knowledge: a.knowledge,
						content: `
<CONTEXT>
	<CONTEXT_NAME>${a.knowledge.name}</CONTEXT_NAME>
	<CONTEXT_CONTENT>${a.knowledge.content}</CONTEXT_CONTENT>
</CONTEXT>
`
					});
			});
			session.messages = [...session.messages, ...knowledgeAttachmentMessages];
			attachments = attachments.filter((a) => a.type !== 'knowledge');
		}

		const imageAttachments = attachments.filter((a): a is ImageAttachment => a.type === 'image');
		const imagesPayload = imageAttachments.map((a) => ({
			filename: a.name,
			data: a.dataUrl.replace(/^data:image\/[a-zA-Z]+;base64,/, '')
		}));

		handleSubmit(imagesPayload.length ? imagesPayload : undefined);
		attachments = [];
	}
</script>

<div
	class="prompt-editor sticky bottom-0 z-10 mx-auto flex w-full flex-col border-t bg-shade-1 p-3 md:p-4 lg:p-6 2xl:max-w-[80ch] 2xl:rounded-t-lg 2xl:border-l 2xl:border-r {editor.isCodeEditor
		? 'prompt-editor--fullscreen min-h-[60dvh] md:min-h-[75dvh]'
		: ''}"
>
	<div class="prompt-editor__form flex h-full min-h-0 flex-col gap-y-2">
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

				{#if attachments.length}
					<div class="attachments overflow-scrollbar flex max-h-48 flex-col gap-y-1 px-3 pb-1">
						{#each attachments as attachment (attachment.type === 'knowledge' ? attachment.fieldId : attachment.id)}
							<div class="attachment flex w-full justify-between">
								{#if attachment.type === 'knowledge'}
									<div class="attachment__knowledge w-full">
										<KnowledgeSelect
											value={attachment.knowledge?.id}
											options={$knowledgeStore?.filter(
												(k) =>
													!attachments.find((a) => {
														if (a.type !== 'knowledge' || attachment.type !== 'knowledge')
															return false;
														return a.fieldId !== attachment.fieldId && a.knowledge?.id === k.id;
													})
											)}
											showLabel={false}
											fieldId={`attachment-${attachment.fieldId}`}
											onChange={(knowledgeId) =>
												knowledgeId && handleSelectKnowledge(attachment.fieldId, knowledgeId)}
											allowClear={false}
										/>
									</div>
								{:else if attachment.type === 'image'}
									<AttachmentImage dataUrl={attachment.dataUrl} name={attachment.name} />
								{/if}
								<Button
									variant="outline"
									onclick={() =>
										handleDeleteAttachment(
											attachment.type === 'knowledge' ? attachment.fieldId : attachment.id
										)}
									data-testid="attachment-delete"
								>
									<Trash_2 class="base-icon" />
								</Button>
							</div>
						{/each}
					</div>
				{/if}

				<div class="flex items-center justify-between px-2 pb-2 pt-0.5">
					<div class="flex gap-x-0.5">
						<Button
							variant="icon"
							onclick={() => {
								attachments = [...attachments, { type: 'knowledge', fieldId: generateRandomId() }];
							}}
							data-testid="knowledge-attachment"
						>
							<Brain class="base-icon" />
						</Button>
						<Button
							variant="icon"
							onclick={handleImageUploadClick}
							data-testid="image-attachment"
							title={$LL.attachImage()}
						>
							<Image class="base-icon" />
						</Button>
					</div>

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
				</div>
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
