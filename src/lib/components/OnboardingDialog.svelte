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
			<div class="flex-1 overflow-auto px-5 py-4">
				{@render children()}
			</div>

			{#if footer}
				<div class="flex items-center justify-between gap-2 border-t border-shade-2 p-4">
					{@render footer()}
				</div>
			{/if}
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>
