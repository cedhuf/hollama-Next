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
		<!-- Blurred, not just dimmed: the page behind stays recognisable as context
		     while losing enough detail to stop competing with the dialog. -->
		<Dialog.Overlay class="modal-overlay fixed inset-0 z-40 bg-black/50 backdrop-blur-sm" />
		<!-- Full screen on phones, a floating card from `sm` up.
		     90vw × 85vh left a 5% gutter of unreachable page around a dialog that
		     already needed every pixel — neither a card nor a screen. These dialogs
		     are whole tasks (settings, a persona, a conversation's config), so on a
		     phone they take the screen; the border, radius and shadow only earn
		     their keep once the dialog is genuinely floating above something. -->
		<Dialog.Content
			class="modal-content fixed inset-0 z-50 flex h-dvh w-screen overflow-hidden bg-shade-1 sm:m-auto sm:h-[600px] sm:max-h-[85vh] sm:w-[90vw] sm:max-w-3xl sm:rounded-xl sm:shadow-xl"
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
