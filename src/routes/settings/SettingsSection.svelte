<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		title: string;
		description?: string;
		/**
		 * Render as a bordered card.
		 *
		 * The rule, so it stays consistent: set it when the section holds plain
		 * controls — the frame is what groups them. Leave it off when the section
		 * hosts its own bordered children (connection cards, per-model prompts, the
		 * data rows): a box inside a box flattens the hierarchy instead of showing it.
		 */
		card?: boolean;
		/** Optional content beside the title (e.g. a status badge). */
		badge?: Snippet;
		children: Snippet;
	}

	let { title, description, card = false, badge, children }: Props = $props();
</script>

<section
	class="flex flex-col gap-2.5 {card ? 'rounded-xl border border-shade-3 bg-shade-0 p-4' : ''}"
>
	<div class="flex flex-col gap-0.5">
		<div class="flex items-center gap-2">
			<h3 class="text-sm font-medium text-active">{title}</h3>
			{@render badge?.()}
		</div>
		{#if description}
			<p class="text-xs leading-snug text-muted">{description}</p>
		{/if}
	</div>
	{@render children()}
</section>
