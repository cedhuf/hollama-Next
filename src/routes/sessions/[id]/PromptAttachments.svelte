<script lang="ts">
	import { Zap } from '@lucide/svelte';
	import type { Snippet } from 'svelte';
	import { toast } from 'svelte-sonner';

	import FieldCheckbox from '$lib/components/FieldCheckbox.svelte';
	import Menu from '$lib/components/Menu.svelte';
	import type { Knowledge } from '$lib/knowledge';
	import { knowledgeStore } from '$lib/localStorage';
	import type { Attachment, ImageAttachment } from '$lib/promptAttachments';
	import { generateRandomId } from '$lib/utils';

	import AddContextMenu from './AddContextMenu.svelte';
	import AttachmentPill from './AttachmentPill.svelte';

	type ToolToggle = { label: string; checked: boolean; onChange: (value: boolean) => void };

	interface Props {
		attachments: Attachment[];
		/** Per-conversation tool switches shown in the lightning dropdown. */
		tools?: ToolToggle[];
		actions?: Snippet;
	}

	let { attachments = $bindable([]), tools = [], actions }: Props = $props();

	const anyToolOn = $derived(tools.some((t) => t.checked));

	// Anything already attached drops out of the menu: a second copy of the same
	// collection is never what was meant, and it used to be possible.
	const availableKnowledge = $derived(
		($knowledgeStore ?? []).filter(
			(k) => !attachments.some((a) => a.type === 'knowledge' && a.knowledge.id === k.id)
		)
	);

	function addKnowledge(knowledge: Knowledge) {
		attachments = [...attachments, { type: 'knowledge', id: generateRandomId(), knowledge }];
	}

	function removeAttachment(id: string) {
		attachments = attachments.filter((a) => a.id !== id);
	}

	function pickImages() {
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
	<!-- One row of pills, wrapping, whatever the kinds. It used to be one full-width
	     control per attachment stacked in a scroller, which made two images look like
	     a form to fill in. -->
	<div class="flex max-h-32 flex-wrap gap-1.5 overflow-y-auto px-3 pb-2">
		{#each attachments as attachment (attachment.id)}
			<AttachmentPill {attachment} onRemove={() => removeAttachment(attachment.id)} />
		{/each}
	</div>
{/if}

<div class="flex items-center justify-between px-2 pb-2 pt-0.5">
	<div class="flex items-center gap-x-0.5">
		<!-- One way in for every kind of context, and the picking happens inside it
		     rather than in a select that appeared in the composer. -->
		<AddContextMenu
			knowledge={availableKnowledge}
			onPickKnowledge={addKnowledge}
			onPickImages={pickImages}
		/>

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
