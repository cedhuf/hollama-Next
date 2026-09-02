<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		title: string;
		description?: string;
		/**
		 * Render as a bordered card. Set it when the section holds plain controls, since
		 * the frame is what groups them. Leave it off when the section hosts its own
		 * bordered children: a box inside a box flattens the hierarchy.
		 */
		card?: boolean;
		/** Optional content beside the title (e.g. a status badge). */
		badge?: Snippet;
		/** Optional control pinned to the right of the title row, e.g. a reset. */
		action?: Snippet;
		children: Snippet;
	}

	let { title, description, card = false, badge, action, children }: Props = $props();
</script>

<section
	class="flex flex-col gap-2.5 {card ? 'border-shade-3 bg-shade-0 rounded-xl border p-4' : ''}"
>
	<div class="flex flex-col gap-0.5">
		<div class="flex items-center gap-2">
			<h3 class="text-active text-sm font-medium">{title}</h3>
			{@render badge?.()}
			{#if action}
				<span class="ml-auto shrink-0">{@render action()}</span>
			{/if}
		</div>
		{#if description}
			<p class="text-muted text-xs leading-snug">{description}</p>
		{/if}
	</div>
	{@render children()}
</section>
