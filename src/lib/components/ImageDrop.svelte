<script lang="ts">
	import { Ban, ImagePlus } from '@lucide/svelte';
	import type { Snippet } from 'svelte';

	import { carriesFiles, readImageFiles, warnRejected } from '$lib/imageFiles';
	import type { ImageAttachment } from '$lib/promptAttachments';

	interface Props {
		/** False still shows the overlay, saying no: a surface that ignores a drop is indistinguishable from one that lost it, which matters most where a model takes no reference image. */
		enabled?: boolean;
		/** The invitation, and what stands in for it when there is none. */
		label: string;
		refusal?: string;
		onImages: (images: ImageAttachment[]) => void;
		class?: string;
		/** Passed through, for a surface whose own styling needs a custom property. */
		style?: string;
		children: Snippet;
	}

	let {
		enabled = true,
		label,
		refusal,
		onImages,
		class: className = '',
		style,
		children
	}: Props = $props();

	/** Counted rather than toggled: `dragleave` fires every time the pointer crosses into a child, so a boolean flickers the whole way across a composer full of buttons. */
	let depth = $state(0);
	const dragging = $derived(depth > 0);

	function onDragEnter(event: DragEvent) {
		if (!carriesFiles(event.dataTransfer)) return;
		depth++;
	}

	function onDragLeave(event: DragEvent) {
		if (!carriesFiles(event.dataTransfer)) return;
		depth = Math.max(0, depth - 1);
	}

	/** Without this the browser opens the file instead, navigating away from the app and losing whatever was typed. */
	function onDragOver(event: DragEvent) {
		if (!carriesFiles(event.dataTransfer)) return;
		event.preventDefault();
		if (event.dataTransfer) event.dataTransfer.dropEffect = enabled ? 'copy' : 'none';
	}

	async function onDrop(event: DragEvent) {
		if (!carriesFiles(event.dataTransfer)) return;
		event.preventDefault();
		depth = 0;
		if (!enabled) return;

		const files = Array.from(event.dataTransfer?.files ?? []);
		if (!files.length) return;

		const { images, rejected } = await readImageFiles(files);
		warnRejected(rejected);
		if (images.length) onImages(images);
	}
</script>

<!-- A wrapper rather than a sibling: the zone has to be exactly the surface it
     invites you to drop on. Not interactive itself, so no handler here needs a
     keyboard equivalent: the paperclip and the paste are beside it. -->
<div
	class="relative {className}"
	{style}
	ondragenter={onDragEnter}
	ondragleave={onDragLeave}
	ondragover={onDragOver}
	ondrop={onDrop}
	role="presentation"
>
	{@render children()}

	{#if dragging}
		<!-- Over the whole surface, transparent to the pointer, so the drag it describes
		     still reaches the element underneath and can be dropped. -->
		<div
			class="pointer-events-none absolute inset-0 z-30 flex items-center justify-center rounded-2xl border-2 border-dashed backdrop-blur-sm {enabled
				? 'border-accent bg-accent/10 text-accent'
				: 'border-shade-5 bg-shade-1/80 text-muted'}"
		>
			<span class="flex items-center gap-2 text-sm font-medium">
				{#if enabled}
					<ImagePlus class="base-icon" />
					{label}
				{:else}
					<Ban class="base-icon" />
					{refusal ?? label}
				{/if}
			</span>
		</div>
	{/if}
</div>
