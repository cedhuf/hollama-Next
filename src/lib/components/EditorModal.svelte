<script lang="ts">
	import { Download, Trash2, X } from '@lucide/svelte';
	import type { Snippet } from 'svelte';

	import LL from '$i18n/i18n-svelte';
	import Modal from '$lib/components/Modal.svelte';

	/**
	 * Editing one thing in the library: a title, a scrolling body, and the two
	 * actions that must never scroll away.
	 *
	 * Written once because it was written twice and immediately drifted. The
	 * persona editor pinned Export and Delete to a footer; the playbook editor,
	 * three days younger, put a delete button at the bottom of the body where it
	 * scrolled out of reach, and had no export at all. Neither of those was a
	 * decision — they are what happens when the same dialog is built again from
	 * memory.
	 *
	 * The two actions live in the title bar, next to the close, rather than in a
	 * footer of their own. A pinned footer costs a full band of height on every
	 * editor to hold two buttons, and the bar that carries the close is already
	 * there, already pinned, and is where the other dialogs in the app keep their
	 * controls. Same reasoning as the store's header.
	 */
	interface Props {
		open: boolean;
		/** Live, so the header follows what is being typed. */
		title: string;
		/** Shown when the title is still empty. */
		placeholder: string;
		children: Snippet;
		/**
		 * The body fills the dialog instead of scrolling in it.
		 *
		 * For an editor that is one field taking the whole height rather than a form
		 * of sections. The dialog is 600px tall whatever is in it, so a body that
		 * scrolls and a field with a floor of its own fight over those pixels: the
		 * knowledge editor overflowed by about thirty of them with nothing typed.
		 *
		 * The flag exists because the two are genuinely different shapes, and it
		 * earns its place by leaving exactly one scrollable area on screen either
		 * way. What it must never become is a second way of saying "and also".
		 */
		fill?: boolean;
		onExport?: () => void;
		onDelete?: () => void;
	}

	let {
		open = $bindable(false),
		title,
		placeholder,
		children,
		fill = false,
		onExport,
		onDelete
	}: Props = $props();
</script>

<Modal bind:open closeButton={false}>
	<div class="flex h-full w-full flex-col">
		<div class="border-shade-2 flex h-12 shrink-0 items-center justify-between gap-2 border-b px-4">
			<span class="text-active truncate text-sm font-semibold">{title.trim() || placeholder}</span>

			<div class="flex shrink-0 items-center gap-1">
				{#if onExport}
					<button
						type="button"
						onclick={onExport}
						title={$LL.export()}
						aria-label={$LL.export()}
						class="text-muted hover:bg-shade-2 hover:text-active rounded-md p-1.5 transition-colors"
					>
						<Download class="h-4 w-4" />
					</button>
				{/if}
				{#if onDelete}
					<button
						type="button"
						onclick={onDelete}
						title={$LL.delete()}
						aria-label={$LL.delete()}
						class="text-muted hover:bg-shade-2 hover:text-negative rounded-md p-1.5 transition-colors"
					>
						<Trash2 class="h-4 w-4" />
					</button>
				{/if}

				<!-- A rule between what the dialog does and what closes it: destructive
				     controls should not sit flush against the one everybody aims for. -->
				{#if onExport || onDelete}
					<span class="bg-shade-3 mx-1 h-5 w-px"></span>
				{/if}

				<button
					type="button"
					onclick={() => (open = false)}
					aria-label={$LL.close()}
					class="text-muted hover:bg-shade-2 hover:text-active rounded-md p-1.5 transition-colors"
				>
					<X class="h-4 w-4" />
				</button>
			</div>
		</div>

		<div class="min-h-0 flex-1 p-4 {fill ? 'overflow-hidden' : 'overflow-auto'}">
			<div
				class="mx-auto flex w-full max-w-[70ch] flex-col {fill ? 'h-full min-h-0 gap-3' : 'gap-6'}"
			>
				{@render children()}
			</div>
		</div>
	</div>
</Modal>
