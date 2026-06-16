<script lang="ts">
	import { X } from '@lucide/svelte';
	import { Dialog } from 'bits-ui';
	import type { Snippet } from 'svelte';

	interface Props {
		open: boolean;
		children: Snippet;
		/** Show the built-in close (X). Disable when the content renders its own. */
		closeButton?: boolean;
	}

	let { open = $bindable(false), children, closeButton = true }: Props = $props();
</script>

<Dialog.Root bind:open>
	<Dialog.Portal>
		<Dialog.Overlay class="fixed inset-0 z-40 bg-black/50" />
		<Dialog.Content
			class="fixed inset-0 z-50 m-auto flex h-[600px] max-h-[85vh] w-[90vw] max-w-3xl overflow-hidden rounded-xl bg-shade-1 shadow-xl"
		>
			{#if closeButton}
				<Dialog.Close
					class="absolute right-3 top-3 z-10 rounded-md p-1.5 text-muted transition-colors hover:bg-shade-2 hover:text-active"
					aria-label="Close"
				>
					<X class="h-4 w-4" />
				</Dialog.Close>
			{/if}

			{@render children()}
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>
