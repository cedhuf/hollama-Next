<script lang="ts">
	import { Tooltip } from 'bits-ui';
	import type { Snippet } from 'svelte';

	/**
	 * Hover/focus tooltip for detail that would clutter the interface if it were
	 * always on screen.
	 *
	 * Built on bits-ui, so it is portalled (never clipped by the composer's
	 * `overflow-hidden`), dismisses on Escape, and — the part a `title` attribute
	 * cannot do — opens on keyboard focus as well as on hover.
	 *
	 * For explanation only: the trigger must still work, and mean the same thing,
	 * for anyone who never sees this.
	 */
	interface Props {
		/** Receives the props to spread onto the caller's own trigger element. */
		trigger: Snippet<[{ props: Record<string, unknown> }]>;
		children: Snippet;
		side?: 'top' | 'right' | 'bottom' | 'left';
		align?: 'start' | 'center' | 'end';
		/** Extra classes for the panel (usually a width). */
		class?: string;
		/**
		 * Tapping the trigger opens the panel instead of closing it.
		 *
		 * A touch screen has no hover, so a tooltip that only answers the pointer is
		 * simply not reachable on a phone. Set this where the tooltip carries the
		 * content rather than a hint about it, and toggle `open` from the trigger.
		 */
		open?: boolean;
		keepOpenOnTriggerClick?: boolean;
	}

	let {
		trigger,
		children,
		side = 'top',
		align = 'center',
		class: className = '',
		open = $bindable(false),
		keepOpenOnTriggerClick = false
	}: Props = $props();
</script>

<Tooltip.Provider>
	<Tooltip.Root delayDuration={200} bind:open disableCloseOnTriggerClick={keepOpenOnTriggerClick}>
		<Tooltip.Trigger>
			{#snippet child({ props })}
				{@render trigger({ props })}
			{/snippet}
		</Tooltip.Trigger>

		<Tooltip.Portal>
			<Tooltip.Content
				{side}
				{align}
				sideOffset={8}
				collisionPadding={12}
				class="border-shade-3 bg-shade-0 z-50 max-w-[calc(100vw-1.5rem)] rounded-lg border px-3 py-2 text-xs leading-relaxed shadow-lg {className}"
			>
				{@render children()}
			</Tooltip.Content>
		</Tooltip.Portal>
	</Tooltip.Root>
</Tooltip.Provider>
