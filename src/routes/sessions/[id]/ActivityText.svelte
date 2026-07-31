<script lang="ts">
	import type { Snippet } from 'svelte';

	import LL from '$i18n/i18n-svelte';

	/**
	 * A timeline step, clamped to a few lines with a way to see the rest.
	 *
	 * A round of thinking runs to several screens on some models, and a turn can
	 * hold three of them: unfolded whole, the timeline buries the answer it was
	 * supposed to introduce. Clamped, each step stays a glance.
	 *
	 * The fade is a mask rather than a gradient overlay, so it works over whatever
	 * the message happens to sit on instead of having to guess a background colour.
	 */

	let {
		children,
		max = 180,
		clamp = true
	}: {
		children: Snippet;
		/** Height, in pixels, beyond which the step is cut off. */
		max?: number;
		/** Off for the step still being written — its newest text is at the bottom. */
		clamp?: boolean;
	} = $props();

	let expanded = $state(false);
	let overflows = $state(false);
	let inner: HTMLDivElement | undefined = $state();

	// Content arrives token by token, so this is a standing measurement rather than
	// a one-off: the step crosses the threshold long after it first renders.
	$effect(() => {
		const element = inner;
		if (!element) return;

		const measure = () => (overflows = element.scrollHeight > max + 8);
		measure();

		const observer = new ResizeObserver(measure);
		observer.observe(element);
		return () => observer.disconnect();
	});

	const isClamped = $derived(clamp && overflows && !expanded);
</script>

<div>
	<div
		class="activity-text"
		class:activity-text--clamped={isClamped}
		style:max-height={isClamped ? `${max}px` : undefined}
	>
		<div bind:this={inner}>
			{@render children()}
		</div>
	</div>
	{#if clamp && overflows}
		<button
			class="mt-1 rounded text-muted underline underline-offset-2 transition-colors hover:text-active"
			onclick={() => (expanded = !expanded)}
		>
			{expanded ? $LL.showLess() : $LL.showMore()}
		</button>
	{/if}
</div>

<style lang="postcss">
	.activity-text--clamped {
		overflow: hidden;
		/* Fades the cut edge instead of slicing a line of text in half. */
		mask-image: linear-gradient(to bottom, black 60%, transparent 100%);
	}
</style>
