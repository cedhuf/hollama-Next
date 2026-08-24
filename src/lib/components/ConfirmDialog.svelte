<script lang="ts" module>
	import { AlertDialog } from 'bits-ui';

	type Request = {
		title: string;
		body?: string;
		/** The word on the button that goes through with it. */
		action: string;
		/** Red rather than accent, for something that cannot be undone. */
		destructive?: boolean;
		settle: (answer: boolean) => void;
	};

	let pending = $state<Request | null>(null);

	/**
	 * Ask before doing something there is no button to ask beside.
	 *
	 * Most destructive actions in the app confirm themselves in place, on the
	 * control that started them (`ButtonConfirm`). This is for the rest: leaving a
	 * page with an unsent message, an import that overwrites everything, a store
	 * update that replaces what somebody has edited. There is no row to arm there,
	 * and until now they all borrowed the browser's own box, which is the one
	 * dialog in the app that does not look like the app and blocks the thread while
	 * it is open.
	 *
	 * One at a time, on purpose: a second question arriving over the first is a
	 * sign the caller is asking too much, not a case to design for.
	 */
	export function confirmAction(request: Omit<Request, 'settle'>): Promise<boolean> {
		if (pending) pending.settle(false);
		return new Promise((resolve) => {
			pending = { ...request, settle: resolve };
		});
	}
</script>

<script lang="ts">
	import { TriangleAlert } from '@lucide/svelte';

	import LL from '$i18n/i18n-svelte';

	function answer(value: boolean) {
		pending?.settle(value);
		pending = null;
	}
</script>

<AlertDialog.Root
	open={!!pending}
	onOpenChange={(next) => {
		// Escape, the overlay, anything that is not the action button: all of them
		// mean no, which is what a question about something irreversible defaults to.
		if (!next) answer(false);
	}}
>
	<AlertDialog.Portal>
		<AlertDialog.Overlay class="modal-overlay modal-scrim fixed inset-0 z-40" />
		<AlertDialog.Content
			class="modal-content bg-shade-1 modal-panel fixed inset-0 z-50 m-auto flex h-fit w-[92vw] max-w-sm flex-col gap-3 rounded-2xl p-5"
		>
			<div class="flex items-center gap-2.5">
				<span
					class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full {pending?.destructive
						? 'bg-negative/15 text-negative'
						: 'bg-warning/15 text-warning'}"
				>
					<TriangleAlert class="h-4.5 w-4.5" />
				</span>
				<AlertDialog.Title class="text-active text-sm font-semibold">
					{pending?.title ?? ''}
				</AlertDialog.Title>
			</div>

			{#if pending?.body}
				<AlertDialog.Description class="text-muted text-sm leading-relaxed">
					{pending.body}
				</AlertDialog.Description>
			{/if}

			<div class="mt-1 flex items-center justify-end gap-2">
				<AlertDialog.Cancel
					class="border-shade-3 text-muted hover:border-shade-4 hover:text-active rounded-lg border px-3 py-2 text-sm transition-colors"
				>
					{$LL.cancel()}
				</AlertDialog.Cancel>
				<AlertDialog.Action
					onclick={() => answer(true)}
					class="text-shade-0 rounded-lg px-3 py-2 text-sm font-medium transition-opacity hover:opacity-90 {pending?.destructive
						? 'bg-negative'
						: 'bg-accent'}"
				>
					{pending?.action ?? ''}
				</AlertDialog.Action>
			</div>
		</AlertDialog.Content>
	</AlertDialog.Portal>
</AlertDialog.Root>
