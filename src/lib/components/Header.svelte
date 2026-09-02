<script lang="ts">
	import type { Snippet } from 'svelte';

	import SidebarToggle from './SidebarToggle.svelte';

	interface Props {
		/**
		 * A pill hovering over the conversation rather than the column's top edge.
		 *
		 * Two different objects: the edge paints beside what it heads, so the wallpaper
		 * reaches it; the pill lies over the conversation, so its tint multiplies and it
		 * reads as solid. What it buys is the text passing around it.
		 *
		 * The band is padded rather than sized, matching the composer at the other end.
		 */
		floating?: boolean;
		headline: Snippet;
		nav: Snippet;
		/**
		 * What the floating bar carries on a phone, where it is a different object: a
		 * pill spanning the width cannot earn it there, since the title truncates to
		 * nothing between two clusters of controls.
		 *
		 * So the phone gets the way to the sidebar and the way to this conversation's
		 * actions, and the title moves inside the menu where it has room to be read.
		 */
		compact?: Snippet;
	}

	let { floating = false, headline, nav, compact }: Props = $props();
</script>

<!-- One header bar everywhere: the same design on mobile and desktop, for
     classic conversations and personas alike. -->
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
	     lets pointer events through, so a message showing there stays reachable. -->
	<div class="floating-band pointer-events-none flex lg:px-6 lg:pt-4 xl:px-8">
		{#if compact}
			<!-- Two objects rather than one bar, pushed to opposite edges: the round one
			     belongs to the app and opens the column beside it, the pill belongs to this
			     conversation. What is between them is the conversation, showing through. -->
			<div class="flex w-full items-center justify-between gap-2 lg:hidden">
				<SidebarToggle variant="floating" />

				<div
					class="surface-floating border-shade-3 pointer-events-auto flex h-12 items-center gap-1 rounded-full border px-1.5 shadow-lg [--surface-tint:66%]"
				>
					{@render compact()}
				</div>
			</div>
		{/if}

		<header
			class="surface-floating border-shade-3 pointer-events-auto h-16 w-full items-center justify-between rounded-full border px-5 text-xs shadow-lg [--surface-tint:66%] {compact
				? 'hidden lg:flex'
				: 'flex'}"
		>
			{@render contents()}
		</header>
	</div>
{:else}
	<!-- The bar sits at the top of the display, so its material passes under the
	     status bar and its height grows by as much, rather than the whole thing
	     being pushed down. -->
	<header
		class="surface-chrome flex h-[var(--app-header-h)] shrink-0 items-center justify-between border-b px-3 text-xs max-lg:h-[calc(var(--app-header-h)+var(--safe-top))] max-lg:pt-[var(--safe-top)]"
	>
		{@render contents()}
	</header>
{/if}
