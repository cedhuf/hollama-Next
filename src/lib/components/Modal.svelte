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
		<Dialog.Overlay class="modal-overlay modal-scrim fixed inset-0 z-40" />
		<!-- Full screen on phones, a floating card from `sm` up. 90vw by 85vh left a 5%
		     gutter of unreachable page around a dialog that needed every pixel. These
		     are whole tasks, so on a phone they take the screen.

		     `overflow-clip` rather than `hidden`: both clip identically, but `hidden`
		     makes this a scroll container, and revealing a control deep inside a panel
		     then scrolled the dialog itself and left it there. `clip` cannot scroll. -->
		<!-- Full screen means the whole screen, safe areas included: the surface runs
		     under the status bar and the home indicator, and the padding holds what is
		     written on it clear of both.

		     No height of its own on a phone: `inset-0` already spans the window, and a
		     height in viewport units can disagree with it. -->
		<Dialog.Content
			class="modal-content bg-shade-1 sm:modal-panel fixed inset-0 z-50 flex w-screen overflow-clip max-sm:pt-[var(--safe-top)] max-sm:pb-[var(--safe-bottom)] sm:m-auto sm:h-[600px] sm:max-h-[85vh] sm:w-[90vw] sm:max-w-3xl sm:rounded-xl"
		>
			{#if closeButton}
				<!-- An absolutely positioned box is laid out against the padding box, which the
				     padding above does not move, so this one pays its own way. -->
				<Dialog.Close
					class="text-muted hover:bg-shade-2 hover:text-active absolute top-3 right-3 z-10 rounded-md p-1.5 transition-colors max-sm:top-[calc(0.75rem+var(--safe-top))]"
					aria-label="Close"
				>
					<X class="h-4 w-4" />
				</Dialog.Close>
			{/if}

			{@render children()}
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>
