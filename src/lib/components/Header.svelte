<script lang="ts">
	import type { Snippet } from 'svelte';

	import SidebarToggle from './SidebarToggle.svelte';

	interface Props {
		confirmDeletion?: boolean;
		/**
		 * A pill hovering over the conversation rather than the column's top edge.
		 *
		 * The two are genuinely different objects, not two skins. The edge paints once
		 * beside what it heads, so the wallpaper reaches it and the two columns share
		 * one top line. The pill lies over the conversation, so its tint multiplies
		 * with the one underneath and it reads as solid — which is what a card is for.
		 * What it buys instead is the text passing around it, the same way it passes
		 * around the composer.
		 *
		 * Either way the bar keeps `--app-header-h` of height, so the sidebar's own
		 * top bar still lines up with it.
		 */
		floating?: boolean;
		headline: Snippet;
		nav: Snippet;
	}

	let { confirmDeletion = false, floating = false, headline, nav }: Props = $props();
</script>

<!-- One header bar everywhere: same design on mobile and desktop, for classic
     conversations and for personas alike. -->
{#snippet contents()}
	<SidebarToggle />
	<div class="flex min-w-0 flex-1 items-center gap-2">
		<div class="flex min-w-0 flex-1 flex-col gap-1">
			{@render headline()}
		</div>
	</div>

	<nav class="flex flex-row items-center">
		{@render nav()}
	</nav>
{/snippet}

{#if floating}
	<!-- The gutter beside the pill belongs to the conversation, not to the bar: it
	     lets pointer events through so a message showing there stays reachable. -->
	<div class="pointer-events-none flex h-[var(--app-header-h)] items-center px-4 lg:px-6 xl:px-8">
		<header
			class="surface-floating pointer-events-auto flex h-14 w-full items-center justify-between rounded-full border border-shade-3 px-3 text-xs shadow-lg {confirmDeletion
				? 'confirm-deletion'
				: ''}"
		>
			{@render contents()}
		</header>
	</div>
{:else}
	<header
		class="surface-chrome flex h-[var(--app-header-h)] shrink-0 items-center justify-between border-b px-3 text-xs {confirmDeletion
			? 'confirm-deletion'
			: ''}"
	>
		{@render contents()}
	</header>
{/if}
