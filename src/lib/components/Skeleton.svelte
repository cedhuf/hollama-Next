<script lang="ts">
	/**
	 * A placeholder for content still being fetched — but only once the wait is
	 * long enough to be worth acknowledging.
	 *
	 * A skeleton that appears and vanishes inside 100ms is worse than no skeleton
	 * at all: the eye registers the flicker, not the information. So this paints
	 * nothing for `delay` milliseconds; if the data lands first the component
	 * unmounts having drawn nothing, and the content simply appears. Past the
	 * threshold it fades in, which also keeps a near-miss from snapping into view.
	 *
	 * Callers stay simple: `{#if loading}<Skeleton … />{/if}`, with no timers of
	 * their own.
	 */
	interface Props {
		/**
		 * `card` — a connection-card row: tile, two lines, trailing control.
		 * `row` — a single bordered line, for lists of compact rows.
		 */
		variant?: 'card' | 'row';
		count?: number;
		/** How long to stay invisible before admitting there's a wait. */
		delay?: number;
	}

	let { variant = 'card', count = 2, delay = 250 }: Props = $props();

	let visible = $state(false);

	$effect(() => {
		const timer = setTimeout(() => (visible = true), delay);
		return () => clearTimeout(timer);
	});
</script>

{#if visible}
	{#each Array.from({ length: count }, (_, i) => i) as i (i)}
		{#if variant === 'card'}
			<!-- Mirrors the real card's geometry, so the content replaces it in place
			     instead of shoving the panel around. -->
			<div
				class="skeleton flex items-center gap-3 rounded-xl border border-shade-3 bg-shade-0 p-3"
				aria-hidden="true"
			>
				<span class="h-9 w-9 shrink-0 rounded-lg bg-shade-2"></span>
				<span class="flex min-w-0 flex-1 flex-col gap-1.5">
					<span class="h-3 w-28 rounded bg-shade-2"></span>
					<span class="h-2.5 w-20 rounded bg-shade-2"></span>
				</span>
				<span class="h-5 w-9 shrink-0 rounded-full bg-shade-2"></span>
			</div>
		{:else}
			<div
				class="skeleton flex items-center gap-3 rounded-md border border-shade-3 p-2.5"
				aria-hidden="true"
			>
				<span class="h-3 w-40 rounded bg-shade-2"></span>
				<span class="ml-auto h-3 w-10 rounded bg-shade-2"></span>
			</div>
		{/if}
	{/each}
{/if}

<style>
	.skeleton {
		animation:
			skeleton-in 200ms ease-out,
			skeleton-pulse 1.6s ease-in-out 200ms infinite;
	}

	@keyframes skeleton-in {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
	}

	@keyframes skeleton-pulse {
		0%,
		100% {
			opacity: 1;
		}
		50% {
			opacity: 0.55;
		}
	}

	/* The placeholder still does its job standing still. */
	@media (prefers-reduced-motion: reduce) {
		.skeleton {
			animation: none;
		}
	}
</style>
