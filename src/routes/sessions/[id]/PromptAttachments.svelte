<script lang="ts">
	import { LoaderCircle, Zap } from '@lucide/svelte';
	import type { Snippet } from 'svelte';
	import { toast } from 'svelte-sonner';

	import LL from '$i18n/i18n-svelte';
	import FieldCheckbox from '$lib/components/FieldCheckbox.svelte';
	import Menu from '$lib/components/Menu.svelte';
	import {
		DOCUMENT_ACCEPT,
		documentsDisabledByInstance,
		extractDocument,
		MAX_PAGES_AS_IMAGES,
		renderPdfPagesAsImages
	} from '$lib/documents';
	import { pickImageFiles, warnRejected } from '$lib/imageFiles';
	import type { Knowledge } from '$lib/knowledge';
	import { knowledgeStore, settingsStore } from '$lib/localStorage';
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

	// --- documents -------------------------------------------------------------

	const documentsAvailable = $derived(
		!documentsDisabledByInstance && $settingsStore.documentsEnabled !== false
	);
	/** Names of the files being read, so the wait is visible where it happens. */
	let reading = $state<string[]>([]);

	function pickDocuments() {
		const input = window.document.createElement('input');
		input.type = 'file';
		input.accept = DOCUMENT_ACCEPT;
		input.multiple = true;
		input.onchange = (event) => {
			const files = (event.target as HTMLInputElement).files;
			if (files?.length) void readDocuments(Array.from(files));
		};
		input.click();
	}

	/**
	 * Read each file and attach what came out.
	 *
	 * One at a time on purpose: parsing a PDF is the heaviest thing this tab will
	 * do, and three of them at once on a phone is how a browser kills a page.
	 */
	async function readDocuments(files: File[]) {
		for (const file of files) {
			reading = [...reading, file.name];
			try {
				const result = await extractDocument(file, {
					ocr: !!$settingsStore.documentOcr,
					ocrLanguage: $settingsStore.documentOcrLanguage
				});

				if (result.looksScanned || !result.markdown) {
					offerPageImages(file, result.markdown.length > 0);
					continue;
				}

				attachments = [
					...attachments,
					{
						type: 'document',
						id: generateRandomId(),
						name: file.name,
						markdown: result.markdown,
						tokens: result.tokens,
						pages: result.pages
					}
				];
				// Warnings are not failures: the document is attached, and this says
				// which parts of it the parser struggled with.
				if (result.warnings.length) {
					toast.warning(file.name, { description: result.warnings.slice(0, 3).join('\n') });
				}
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				toast.error($LL.documentFailed({ name: file.name }), { description: message });
			} finally {
				reading = reading.filter((name) => name !== file.name);
			}
		}
	}

	/**
	 * Nothing readable came out, which for a PDF almost always means a scan.
	 *
	 * Rather than attach an empty document, offer the way that works without an
	 * OCR engine: the pages as pictures, read by a vision model. Offered, not
	 * done, because it costs far more context than text and only pays off if the
	 * conversation's model can see.
	 */
	function offerPageImages(file: File, hadSomeText: boolean) {
		const isPdf = file.name.toLowerCase().endsWith('.pdf');
		if (!isPdf) {
			toast.warning($LL.documentEmpty({ name: file.name }));
			return;
		}

		toast.warning(hadSomeText ? $LL.documentMostlyImages() : $LL.documentLooksScanned(), {
			description: $LL.documentPagesAsImagesHelp({ max: MAX_PAGES_AS_IMAGES }),
			duration: 12_000,
			action: {
				label: $LL.documentPagesAsImages(),
				onClick: () => void attachPageImages(file)
			}
		});
	}

	async function attachPageImages(file: File) {
		reading = [...reading, file.name];
		try {
			const pages = await renderPdfPagesAsImages(file);
			attachments = [
				...attachments,
				...pages.map((page): ImageAttachment => ({
					type: 'image',
					id: generateRandomId(),
					name: page.name,
					dataUrl: page.dataUrl
				}))
			];
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			toast.error($LL.documentFailed({ name: file.name }), { description: message });
		} finally {
			reading = reading.filter((name) => name !== file.name);
		}
	}

	async function pickImages() {
		const { images, rejected } = await pickImageFiles();
		warnRejected(rejected);
		if (images.length) attachments = [...attachments, ...images];
	}
</script>

{#if attachments.length || reading.length}
	<!-- One row of pills, wrapping, whatever the kinds. It used to be one full-width
	     control per attachment stacked in a scroller, which made two images look like
	     a form to fill in. -->
	<div class="flex max-h-32 flex-wrap gap-1.5 overflow-y-auto px-3 pb-2">
		{#each attachments as attachment (attachment.id)}
			<AttachmentPill {attachment} onRemove={() => removeAttachment(attachment.id)} />
		{/each}
		{#each reading as name (name)}
			<!-- The pill exists before its contents do, in the shape it will take: a
			     large PDF takes a few seconds, and nothing happening looks like nothing
			     working. -->
			<span
				class="border-shade-3 text-muted flex max-w-full items-center gap-1.5 rounded-full border border-dashed py-1 pr-2.5 pl-1.5 text-xs"
			>
				<span class="flex h-5 w-5 shrink-0 items-center justify-center">
					<LoaderCircle class="h-3.5 w-3.5 animate-spin" />
				</span>
				<span class="truncate">{name}</span>
			</span>
		{/each}
	</div>
{/if}

<div class="flex items-center justify-between px-2 pt-0.5 pb-2">
	<div class="flex items-center gap-x-0.5">
		<!-- One way in for every kind of context, and the picking happens inside it
		     rather than in a select that appeared in the composer. -->
		<AddContextMenu
			knowledge={availableKnowledge}
			{documentsAvailable}
			onPickKnowledge={addKnowledge}
			onPickImages={pickImages}
			onPickDocuments={pickDocuments}
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

				<p class="text-muted px-2 pt-0.5 pb-1 text-[11px] font-semibold tracking-wider uppercase">
					Tools
				</p>
				{#each tools as tool (tool.label)}
					<div class="hover:bg-shade-1 rounded-md px-2 py-1.5">
						<FieldCheckbox label={tool.label} checked={tool.checked} onChange={tool.onChange} />
					</div>
				{/each}
			</Menu>
		{/if}
	</div>

	{@render actions?.()}
</div>
