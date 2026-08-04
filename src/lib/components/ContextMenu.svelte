<script lang="ts">
	import { ContextMenu } from 'bits-ui';
	import type { Snippet } from 'svelte';

	/**
	 * Right-click menu on a row.
	 *
	 * The counterpart to `Menu`: same panel, same rows, opened by the gesture
	 * people already use on a list. It exists so a row's actions do not have to
	 * live permanently on top of the row itself, where they cover the title on
	 * narrow screens and put a delete button one slip away from the thing you
	 * meant to click.
	 *
	 * `trigger` receives the props to spread onto whatever the caller already
	 * renders, so the whole row becomes the target rather than some handle inside
	 * it. On touch, a long press opens it.
	 */
	interface Props {
		/** Receives the props to spread onto the caller's own row element. */
		trigger: Snippet<[{ props: Record<string, unknown> }]>;
		children: Snippet;
		/** Extra classes for the panel (usually a width). */
		class?: string;
	}

	let { trigger, children, class: className = 'w-56' }: Props = $props();
</script>

<ContextMenu.Root>
	<ContextMenu.Trigger>
		{#snippet child({ props })}
			{@render trigger({ props })}
		{/snippet}
	</ContextMenu.Trigger>

	<ContextMenu.Portal>
		<ContextMenu.Content
			collisionPadding={12}
			class="z-50 max-h-[min(60dvh,24rem)] max-w-[calc(100vw-1.5rem)] overflow-y-auto rounded-xl border border-shade-3 bg-shade-0 p-1.5 shadow-lg focus-visible:outline-none {className}"
		>
			{@render children()}
		</ContextMenu.Content>
	</ContextMenu.Portal>
</ContextMenu.Root>
