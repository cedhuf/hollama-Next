<script lang="ts">
	import type { Snippet } from 'svelte';

	import { page } from '$app/state';

	import TabBar from './TabBar.svelte';

	/**
	 * The shell of the mobile-first interface.
	 *
	 * One column, one thing at a time, and the way around floating at the bottom
	 * where a thumb already is. No sidebar and no drawer: the responsive interface
	 * has both, and they are the right answer there, on a screen that can hold two
	 * things at once.
	 *
	 * It sits inside the root layout, so the stores, the theme, the notifications
	 * and the dialogs are already there. What this replaces is the frame, which is
	 * the whole of the difference between the two interfaces.
	 *
	 * The bar floats over the content rather than sitting under it, so the page
	 * scrolls the whole height of the screen and only pads its own foot by the
	 * bar's height. A page that wants the whole screen (voice) simply does not.
	 */
	let { children }: { children: Snippet } = $props();

	const bare = $derived(page.url.pathname.startsWith('/m/voice'));
</script>

<div class="bg-shade-2 relative flex h-dvh w-full flex-col overflow-hidden">
	<!-- Two slow lights behind everything.

	     Drawn from the theme's own accent rather than from a colour of their own, so
	     the twelve themes each get their version of it and none of them gets a blue
	     glow it never asked for. Very low, and enormous: at this size and this
	     opacity it reads as the screen having depth rather than as two circles.

	     Still, and that is not a style choice. Animating a transform on a layer this
	     size promotes it to its own compositing layer for the life of the app, and on
	     iOS that is enough to change how the viewport composes: the safe area stopped
	     being ours to paint and the system inset the whole webview instead, on both
	     interfaces. Depth is worth two gradients. It is not worth that. -->
	<div class="glow pointer-events-none absolute inset-0" aria-hidden="true"></div>

	<!-- The safe area is the page's business, not the tab bar's: the content
	     scrolls under the notch, and only the bar below reserves room. -->
	<main class="min-h-0 flex-1 overflow-y-auto pt-[env(safe-area-inset-top)]">
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
