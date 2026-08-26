<script lang="ts">
	import type { Snippet } from 'svelte';

	import SidebarToggle from './SidebarToggle.svelte';

	interface Props {
		/**
		 * A pill hovering over the conversation rather than the column's top edge.
		 *
		 * The two are genuinely different objects, not two skins. The edge paints once
		 * beside what it heads, so the wallpaper reaches it and the two columns share
		 * one top line. The pill lies over the conversation, so its tint multiplies
		 * with the one underneath and it reads as solid, which is what a card is for.
		 * What it buys instead is the text passing around it, the same way it passes
		 * around the composer.
		 *
		 * The band around the pill is padded rather than sized: sixteen from the card's
		 * edge, eight from the text, and the composer is spaced the same way at the
		 * other end, so the column reads as balanced whichever end you look at. The
		 * pill's own horizontal padding clears its curve, since at this radius text
		 * set flush to the edge sits inside the rounding rather than beside it.
		 */
		floating?: boolean;
		headline: Snippet;
		nav: Snippet;
		/**
		 * What the floating bar carries on a phone, where it is a different object.
		 *
		 * A pill spanning the width has to earn it, and on a narrow screen it cannot:
		 * the title truncates to nothing between two clusters of controls, and the
		 * controls themselves shrink to fit around it. So the phone gets what it
		 * actually needs, the way to the sidebar and the way to this conversation's
		 * own actions, and the title moves inside the menu where it has room to be
		 * read. The wide bar is unchanged, because at that width it works.
		 */
		compact?: Snippet;
	}

	let { floating = false, headline, nav, compact }: Props = $props();
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
	<div class="floating-band pointer-events-none flex lg:px-6 lg:pt-4 xl:px-8">
		{#if compact}
			<!-- Two objects rather than one bar, because they answer to two different
			     places, and pushed to opposite edges for the same reason: the round one
			     belongs to the app and opens the column beside it, the pill belongs to
			     this conversation. What is between them is left to the conversation,
			     which shows through it. -->
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
	<!-- The bar sits at the top of the display, so its material passes under the status
	     bar and its height grows by as much, rather than the whole thing being pushed
	     down and leaving a strip of something else above it. -->
	<header
		class="surface-chrome flex h-[var(--app-header-h)] shrink-0 items-center justify-between border-b px-3 text-xs max-lg:h-[calc(var(--app-header-h)+var(--safe-top))] max-lg:pt-[var(--safe-top)]"
	>
		{@render contents()}
	</header>
{/if}
