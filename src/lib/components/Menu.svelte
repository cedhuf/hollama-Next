<script lang="ts">
	import { DropdownMenu } from 'bits-ui';
	import type { Snippet } from 'svelte';

	/**
	 * Dropdown menu of *actions* (the value-picking counterpart is `Select`).
	 *
	 * Built on bits-ui so every instance gets flipping, collision detection, focus
	 * handling, Escape/outside-click and ARIA for free, and, because the content is
	 * portalled, it is never clipped by an `overflow-hidden` ancestor (the session
	 * card is one).
	 *
	 * The trigger stays the caller's own markup: `trigger` receives the props to
	 * spread onto whatever button it already renders.
	 */
	interface Props {
		/** Receives the props to spread onto the caller's own trigger element. */
		trigger: Snippet<[{ props: Record<string, unknown> }]>;
		children: Snippet;
		align?: 'start' | 'center' | 'end';
		side?: 'top' | 'right' | 'bottom' | 'left';
		/** Extra classes for the panel (usually a width). */
		class?: string;
		open?: boolean;
	}

	let {
		trigger,
		children,
		align = 'end',
		side = 'bottom',
		class: className = 'w-52',
		open = $bindable(false)
	}: Props = $props();
</script>

<DropdownMenu.Root bind:open>
	<DropdownMenu.Trigger>
		{#snippet child({ props })}
			{@render trigger({ props })}
		{/snippet}
	</DropdownMenu.Trigger>

	<DropdownMenu.Portal>
		<DropdownMenu.Content
			{align}
			{side}
			sideOffset={6}
			collisionPadding={12}
			class="border-shade-3 bg-shade-0 z-50 max-h-[min(60dvh,24rem)] max-w-[calc(100vw-1.5rem)] overflow-y-auto rounded-xl border p-1.5 shadow-lg focus-visible:outline-none {className}"
		>
			{@render children()}
		</DropdownMenu.Content>
	</DropdownMenu.Portal>
</DropdownMenu.Root>
