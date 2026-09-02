<script lang="ts">
	import type { Snippet } from 'svelte';

	import { page } from '$app/state';

	import TabBar from './TabBar.svelte';

	/**
	 * The shell of the mobile-first interface: one column, one thing at a time, and
	 * the way around floating at the bottom where a thumb already is.
	 *
	 * It sits inside the root layout, so the stores, the theme and the dialogs are
	 * already there. What this replaces is the frame.
	 *
	 * The bar floats over the content, so the page scrolls the whole height of the
	 * screen and only pads its foot by the bar's height.
	 */
	let { children }: { children: Snippet } = $props();

	const bare = $derived(page.url.pathname.startsWith('/m/voice'));
</script>

<div class="bg-shade-2 relative flex h-dvh w-full flex-col overflow-hidden">
	<!-- Two slow lights behind everything, drawn from the theme's own accent, so the
	     twelve themes each get their version and none gets a blue glow it never
	     asked for. Very low and enormous: it reads as depth rather than two circles.

	     Still, and not as a style choice: animating a transform on a layer this size
	     promotes it to its own compositing layer for the life of the app, and on iOS
	     that changed how the viewport composes, so the safe area stopped being ours
	     to paint. Depth is worth two gradients, not that. -->
	<div class="glow pointer-events-none absolute inset-0" aria-hidden="true"></div>

	<!-- The safe area is the page's business, not the tab bar's: the content scrolls
	     under the notch, and only the bar below reserves room. -->
	<main class="min-h-0 flex-1 overflow-y-auto pt-[var(--safe-top)]">
		{@render children()}
	</main>

	{#if !bare}
		<TabBar />
	{/if}
</div>

<style lang="postcss">
	.glow {
		background:
			radial-gradient(
				60% 42% at 12% 8%,
				color-mix(in srgb, var(--color-accent) 22%, transparent),
				transparent 70%
			),
			radial-gradient(
				55% 38% at 92% 32%,
				color-mix(in srgb, var(--color-accent) 14%, transparent),
				transparent 72%
			);
	}
</style>
