<script lang="ts">
	import { Brain, Image, Zap } from '@lucide/svelte';
	import Trash_2 from '@lucide/svelte/icons/trash-2';
	import type { Snippet } from 'svelte';
	import { toast } from 'svelte-sonner';

	import LL from '$i18n/i18n-svelte';
	import Button from '$lib/components/Button.svelte';
	import FieldCheckbox from '$lib/components/FieldCheckbox.svelte';
	import Menu from '$lib/components/Menu.svelte';
	import { loadKnowledge } from '$lib/knowledge';
	import { knowledgeStore } from '$lib/localStorage';
	import type { Attachment, ImageAttachment } from '$lib/promptAttachments';
	import { generateRandomId } from '$lib/utils';

	import AttachmentImage from './AttachmentImage.svelte';
	import KnowledgeSelect from './KnowledgeSelect.svelte';

	type ToolToggle = { label: string; checked: boolean; onChange: (value: boolean) => void };

	interface Props {
		attachments: Attachment[];
		/** Per-conversation tool switches shown in the lightning dropdown. */
		tools?: ToolToggle[];
		actions?: Snippet;
	}

	let { attachments = $bindable([]), tools = [], actions }: Props = $props();

	const anyToolOn = $derived(tools.some((t) => t.checked));

	function addKnowledge() {
		attachments = [...attachments, { type: 'knowledge', fieldId: generateRandomId() }];
	}

	function handleSelectKnowledge(fieldId: string, knowledgeId: string) {
		attachments = attachments.map((a) =>
			a.type === 'knowledge' && a.fieldId === fieldId
				? { ...a, knowledge: loadKnowledge(knowledgeId) }
				: a
		);
	}

	function handleDeleteAttachment(id: string) {
		attachments = attachments.filter((a) => (a.type === 'knowledge' ? a.fieldId : a.id) !== id);
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
			const newAttachments: ImageAttachment[] = [];
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
					reader.onerror = () => resolve();
					reader.readAsDataURL(file);
				});
			});

			Promise.all(filePromises).then(() => {
				if (unsupportedFiles) {
					toast.warning('Some files were ignored. Only PNG and JPEG images are supported.');
				}
				if (newAttachments.length) attachments = [...attachments, ...newAttachments];
			});
		};
		input.click();
	}
</script>

{#if attachments.length}
	<div class="overflow-scrollbar flex max-h-48 flex-col gap-y-1 px-3 pb-1">
		{#each attachments as attachment (attachment.type === 'knowledge' ? attachment.fieldId : attachment.id)}
			<div class="flex w-full justify-between">
				{#if attachment.type === 'knowledge'}
					<div class="w-full">
						<KnowledgeSelect
							value={attachment.knowledge?.id}
							options={$knowledgeStore?.filter(
								(k) =>
									!attachments.find(
										(a) =>
											a.type === 'knowledge' &&
											a.fieldId !== attachment.fieldId &&
											a.knowledge?.id === k.id
									)
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
	<div class="flex items-center gap-x-0.5">
		<Button variant="icon" onclick={addKnowledge} data-testid="knowledge-attachment">
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
		{#if tools.length}
			<!-- Toggles, not one-shot actions: the rows stay plain checkboxes so the menu
			     survives each click, but the panel itself is the shared portalled one. -->
			<Menu side="top" align="start" class="w-60">
				{#snippet trigger({ props })}
					<button
						{...props}
						type="button"
						title="Tools"
						aria-label="Tools"
						aria-pressed={anyToolOn}
						data-testid="tools-toggle"
						class="flex items-center justify-center rounded-md px-2.5 py-2 transition-colors {anyToolOn
							? 'bg-accent/15 text-accent'
							: 'text-muted hover:bg-shade-1 hover:text-active'}"
					>
						<Zap class="base-icon" />
					</button>
				{/snippet}

				<p class="px-2 pb-1 pt-0.5 text-[11px] font-semibold uppercase tracking-wider text-muted">
					Tools
				</p>
				{#each tools as tool (tool.label)}
					<div class="rounded-md px-2 py-1.5 hover:bg-shade-1">
						<FieldCheckbox label={tool.label} checked={tool.checked} onChange={tool.onChange} />
					</div>
				{/each}
			</Menu>
		{/if}
	</div>

	{@render actions?.()}
</div>
