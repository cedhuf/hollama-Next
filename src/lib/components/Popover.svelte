<script lang="ts">
	import { Popover } from 'bits-ui';
	import type { Snippet } from 'svelte';

	/**
	 * A floating panel anchored to its trigger, for content rather than for a list
	 * of actions (that is `Menu`).
	 *
	 * The distinction matters: a menu owns the keyboard, which is right for rows
	 * you arrow through and wrong the moment the panel contains a text field. A
	 * popover leaves the keyboard to whatever is inside it, so a search box behaves
	 * like a search box.
	 *
	 * Same panel treatment as `Menu` on purpose, so the two read as one family.
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
		align = 'start',
		side = 'bottom',
		class: className = 'w-64',
		open = $bindable(false)
	}: Props = $props();
</script>

<Popover.Root bind:open>
	<Popover.Trigger>
		{#snippet child({ props })}
			{@render trigger({ props })}
		{/snippet}
	</Popover.Trigger>

	<Popover.Portal>
		<Popover.Content
			{align}
			{side}
			sideOffset={6}
			collisionPadding={12}
			class="z-50 max-w-[calc(100vw-1.5rem)] rounded-xl border border-shade-3 bg-shade-0 p-1.5 shadow-lg focus-visible:outline-none {className}"
		>
			{@render children()}
		</Popover.Content>
	</Popover.Portal>
</Popover.Root>
