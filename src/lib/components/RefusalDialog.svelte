<script lang="ts">
	import { Mail, TriangleAlert } from '@lucide/svelte';
	import { AlertDialog } from 'bits-ui';

	import LL from '$i18n/i18n-svelte';
	import { instanceConfig } from '$lib/stores/instance';

	/**
	 * When the instance refuses a turn, rather than the provider failing one.
	 *
	 * A toast is right for "the server did not answer": it is transient, it is
	 * nobody's decision, and trying again is a reasonable next move. A refusal is
	 * neither of those. Somebody decided this, trying again will do the same
	 * thing, and what the person needs is who to ask — so it stops the page and
	 * says so, with the address.
	 *
	 * `AlertDialog` rather than `Dialog`, because that is what it is: a message
	 * with one way out, focus trapped on it, and the escape hatch is
	 * acknowledging it.
	 */
	interface Props {
		open: boolean;
		/** What the server said. Kept, because "no price for X" names the model. */
		detail?: string;
	}

	let { open = $bindable(false), detail }: Props = $props();

	const email = $derived($instanceConfig?.adminEmail ?? null);
</script>

<AlertDialog.Root bind:open>
	<AlertDialog.Portal>
		<AlertDialog.Overlay class="modal-overlay fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" />
		<AlertDialog.Content
			class="modal-content fixed inset-0 z-50 m-auto flex h-fit w-[92vw] max-w-sm flex-col gap-3 rounded-2xl bg-shade-1 p-5 shadow-xl"
		>
			<div class="flex items-center gap-2.5">
				<span
					class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-warning/15 text-warning"
				>
					<TriangleAlert class="h-4.5 w-4.5" />
				</span>
				<AlertDialog.Title class="text-sm font-semibold text-active">
					{$LL.refusedTitle()}
				</AlertDialog.Title>
			</div>

			<AlertDialog.Description class="text-sm leading-relaxed text-muted">
				{$LL.refusedBody()}
			</AlertDialog.Description>

			{#if detail}
				<!-- The server's own words, quoted rather than paraphrased: one of the two
				     refusals names the model that has no price, and that is the fact whoever
				     reads this has to pass on. -->
				<p class="rounded-md border border-shade-3 bg-shade-0 px-3 py-2 text-xs text-muted">
					{detail}
				</p>
			{/if}

			{#if email}
				<a
					href="mailto:{email}"
					class="flex items-center gap-2 rounded-md border border-shade-3 px-3 py-2 text-sm text-active transition-colors hover:border-accent"
				>
					<Mail class="h-4 w-4 shrink-0 text-muted" />
					<span class="min-w-0 truncate">{email}</span>
				</a>
			{/if}

			<AlertDialog.Action
				class="mt-1 self-end rounded-lg bg-accent px-3 py-2 text-sm font-medium text-shade-0 transition-opacity hover:opacity-90"
			>
				{$LL.close()}
			</AlertDialog.Action>
		</AlertDialog.Content>
	</AlertDialog.Portal>
</AlertDialog.Root>
