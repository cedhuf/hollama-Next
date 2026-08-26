<script lang="ts">
	import type { Snippet } from 'svelte';

	import { onNavigate } from '$app/navigation';
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

	/**
	 * How one screen should give way to the next.
	 *
	 * A phone interface that cuts between pages reads as a website, and this one is
	 * trying not to. What it borrows is the grammar rather than the timings: moving
	 * sideways between peers is a dissolve, going deeper pushes in from the right and
	 * comes back the way it went, and something that takes the whole screen over
	 * rises from the bottom like a sheet.
	 *
	 * The voice screen is that last case. It is not a destination among four, it is a
	 * mode you enter, and it earns the gesture that says so.
	 */
	type Move = 'fade' | 'push' | 'pop' | 'sheet-in' | 'sheet-out';

	const wait = (ms: number) => new Promise((done) => setTimeout(done, ms));

	/** How deep a path sits. Only the conversation is below the top level. */
	const depth = (path: string) => (/^\/m\/sessions\/.+/.test(path) ? 1 : 0);

	function moveFor(from: string, to: string): Move {
		if (to.startsWith('/m/voice')) return 'sheet-in';
		if (from.startsWith('/m/voice')) return 'sheet-out';
		const change = depth(to) - depth(from);
		return change > 0 ? 'push' : change < 0 ? 'pop' : 'fade';
	}

	/**
	 * Handed to the browser's own transition machinery rather than animated here.
	 *
	 * The View Transitions API snapshots the page before and after and animates
	 * between the two, which is the only way to cross-fade one route into another
	 * without holding both in the DOM at once. Where it is missing the navigation
	 * simply happens, which is what happened everywhere until now.
	 *
	 * The direction is written onto the document so the stylesheet can pick an
	 * animation. It has to be an attribute rather than a variable: the pseudo-
	 * elements being animated are the browser's, not this component's, and a
	 * selector is the only thing that reaches them.
	 */
	onNavigate((navigation) => {
		const start = (document as Document & { startViewTransition?: (fn: () => void) => unknown })
			.startViewTransition;
		if (!start) return;

		const from = navigation.from?.url.pathname;
		const to = navigation.to?.url.pathname;
		// Only inside this interface. Leaving it for the responsive one is a change of
		// product, and sliding into that would be claiming they are the same thing.
		if (!from || !to || !from.startsWith('/m') || !to.startsWith('/m')) return;
		if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

		document.documentElement.dataset.move = moveFor(from, to);

		return new Promise<void>((resolve) => {
			/**
			 * Three ways out, and all three are needed.
			 *
			 * The callback is the ordinary one. `finished` rejecting covers a transition
			 * the browser abandons, which it does whenever another one is already
			 * running. And the timer covers everything else, because the one thing this
			 * promise must never do is fail to settle: `onNavigate` holds the navigation
			 * open until it does, so a transition that quietly never starts is a tap
			 * that quietly does nothing.
			 */
			const transition = start.call(document, async () => {
				resolve();
				// Bounded, because the navigation waits on every other hook too and the
				// old page is frozen on screen for as long as this is held. Better a
				// transition that ends early than a screen that stops responding.
				await Promise.race([navigation.complete, wait(400)]);
			}) as { finished?: Promise<unknown> } | undefined;

			transition?.finished?.catch(() => resolve());
			setTimeout(resolve, 500);
		});
	});
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
	/*
	 * What the browser does between two snapshots of the page.
	 *
	 * All of it is `:global`, and it has to be: these pseudo-elements belong to the
	 * document root, not to this component, so a scoped selector would never find
	 * them. The direction comes off the attribute the navigation hook writes.
	 *
	 * The easing is the one iOS uses for its own pushes, weighted heavily to the
	 * front so a screen arrives quickly and settles slowly. Linear motion is the
	 * thing that makes a transition feel like a slideshow.
	 */
	:global(::view-transition-old(root)),
	:global(::view-transition-new(root)) {
		/* The browser's own cross-fade, turned off. Every case below says what it
		   wants, and leaving the default underneath means two animations arguing. */
		animation: none;
		mix-blend-mode: normal;
	}

	/* Between peers: a dissolve, and a short one. Sideways movement between tabs is
	   what a page-turn animation is for, and a tab bar is not a book. */
	:global(html[data-move='fade']::view-transition-old(root)) {
		animation: 120ms cubic-bezier(0.4, 0, 1, 1) both vt-fade-out;
	}

	:global(html[data-move='fade']::view-transition-new(root)) {
		animation: 200ms cubic-bezier(0, 0, 0.2, 1) both vt-fade-in;
	}

	/* Deeper: the new screen comes in from the right and the old one drifts a little
	   the other way, which is what gives the pair a sense of one being behind the
	   other rather than of two cards being swapped. */
	:global(html[data-move='push']::view-transition-old(root)) {
		animation: 300ms cubic-bezier(0.32, 0.72, 0, 1) both vt-recede-left;
	}

	:global(html[data-move='push']::view-transition-new(root)) {
		animation: 300ms cubic-bezier(0.32, 0.72, 0, 1) both vt-in-right;
		z-index: 1;
	}

	/* And back out the way it came in. The old screen is the one that moves now,
	   which is what makes it read as leaving rather than as being replaced. */
	:global(html[data-move='pop']::view-transition-old(root)) {
		animation: 280ms cubic-bezier(0.32, 0.72, 0, 1) both vt-out-right;
		z-index: 1;
	}

	:global(html[data-move='pop']::view-transition-new(root)) {
		animation: 280ms cubic-bezier(0.32, 0.72, 0, 1) both vt-return-left;
	}

	/* A sheet. The page underneath stays exactly where it is, which is the whole
	   difference between something covering the screen and something replacing it. */
	:global(html[data-move='sheet-in']::view-transition-new(root)) {
		animation: 380ms cubic-bezier(0.32, 0.72, 0, 1) both vt-in-bottom;
		z-index: 1;
	}

	:global(html[data-move='sheet-out']::view-transition-old(root)) {
		animation: 320ms cubic-bezier(0.4, 0, 0.6, 1) both vt-out-bottom;
		z-index: 1;
	}

	@keyframes vt-fade-in {
		from {
			opacity: 0;
		}
	}

	@keyframes vt-fade-out {
		to {
			opacity: 0;
		}
	}

	@keyframes vt-in-right {
		from {
			transform: translateX(100%);
		}
	}

	@keyframes vt-recede-left {
		to {
			transform: translateX(-24%);
			opacity: 0.6;
		}
	}

	@keyframes vt-out-right {
		to {
			transform: translateX(100%);
		}
	}

	@keyframes vt-return-left {
		from {
			transform: translateX(-24%);
			opacity: 0.6;
		}
	}

	@keyframes vt-in-bottom {
		from {
			transform: translateY(100%);
		}
	}

	@keyframes vt-out-bottom {
		to {
			transform: translateY(100%);
		}
	}

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
