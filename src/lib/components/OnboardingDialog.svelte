<script lang="ts">
	import { X } from '@lucide/svelte';
	import { Dialog } from 'bits-ui';
	import type { Snippet } from 'svelte';

	/**
	 * The shared shell for every onboarding flow: the modal, the step indicator and
	 * the dismiss affordance. Flows supply their own step content and footer, so the
	 * chrome stays identical between the local first-run wizard and the server-mode
	 * welcome tour.
	 */
	interface Props {
		open: boolean;
		/** Current step index (0-based). */
		step: number;
		totalSteps: number;
		/** Called when the dialog is dismissed — the flow decides what "done" means. */
		onDismiss: () => void;
		children: Snippet;
		footer?: Snippet;
	}

	let { open, step, totalSteps, onDismiss, children, footer }: Props = $props();

	/**
	 * The dialog grows and shrinks between steps, and does it smoothly.
	 *
	 * Each step is a different amount of content, so the box used to jump on every
	 * Next: a profile form, then a list of servers, then three bubbles. A fixed
	 * height would have been the other answer and is worse, because it is the
	 * tallest step's height on every step, leaving the short ones stranded in a
	 * half-empty box.
	 *
	 * The measurement drives a height on the outer box only. Nothing reads it back:
	 * the inner box is in normal flow and its natural height does not depend on
	 * what the outer one is set to, so there is no loop here, only a value copied
	 * one way. Before the first measurement the height is left alone, so the first
	 * paint is the content's own size rather than zero.
	 *
	 * Not `flex-1`, which was here before: it sets `flex-basis: 0%`, and a basis is
	 * what a column flex container sizes from, so the height below would have been
	 * measured, written, and then ignored. Left to shrink instead, the height is
	 * what it is until the dialog hits its ceiling, at which point the box gives
	 * way and scrolls.
	 */
	let contentHeight = $state(0);
</script>

<Dialog.Root
	{open}
	onOpenChange={(o) => {
		if (!o) onDismiss();
	}}
>
	<Dialog.Portal>
		<Dialog.Overlay class="modal-overlay fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" />
		<Dialog.Content
			class="modal-content fixed inset-0 z-50 m-auto flex h-fit max-h-[88vh] w-[92vw] max-w-lg flex-col overflow-hidden rounded-2xl bg-shade-1 shadow-xl"
		>
			<!-- Step indicator -->
			<div class="flex items-center gap-3 px-5 pb-3 pt-5">
				<div class="flex flex-1 gap-1.5">
					{#each Array.from({ length: totalSteps }, (_, i) => i) as i (i)}
						<span
							class="h-1 flex-1 rounded-full transition-colors {i <= step
								? 'bg-accent'
								: 'bg-shade-3'}"
						></span>
					{/each}
				</div>
				<Dialog.Close
					class="rounded-md p-1 text-muted transition-colors hover:bg-shade-2 hover:text-active"
					aria-label="Close"
				>
					<X class="h-4 w-4" />
				</Dialog.Close>
			</div>

			<!-- Step content -->
			<div
				class="onboarding-body min-h-0 overflow-auto"
				style={contentHeight ? `height:${contentHeight}px` : ''}
			>
				<div bind:clientHeight={contentHeight} class="px-5 py-4">
					{@render children()}
				</div>
			</div>

			{#if footer}
				<div class="flex items-center justify-between gap-2 border-t border-shade-2 p-4">
					{@render footer()}
				</div>
			{/if}
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>

<style lang="postcss">
	.onboarding-body {
		transition: height 260ms cubic-bezier(0.32, 0.72, 0, 1);
	}

	@media (prefers-reduced-motion: reduce) {
		.onboarding-body {
			transition: none;
		}
	}
</style>
