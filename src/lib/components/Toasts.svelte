<script lang="ts">
	import { X } from '@lucide/svelte';
	import { Toaster } from 'svelte-sonner';

	// The app's only toast surface. One position, one card: the severity shows in
	// the icon rather than in a full-width coloured banner, so a success and a
	// failure sit in the same place and read the same way. What is written inside
	// the card is `ToastBody.svelte`.
	//
	// Nothing else in the app should mount a `Toaster` or reach for its options.
	// Raise notifications through `$lib/toast`.
</script>

<Toaster
	position="bottom-right"
	offset={16}
	mobileOffset={{ bottom: 16, left: 12, right: 12 }}
	visibleToasts={5}
	toastOptions={{
		unstyled: true,
		classes: {
			toast:
				'bg-shade-1 border-shade-3 text-active relative flex w-full items-start gap-x-2.5 rounded-lg border px-3.5 py-3 text-xs shadow-lg',
			closeButton:
				'text-muted hover:text-active absolute! top-1! right-1! left-auto! translate-x-0! translate-y-0! rounded! border-0! bg-transparent! p-1!'
		}
	}}
>
	{#snippet closeIcon()}
		<X class="h-3.5 w-3.5" />
	{/snippet}
</Toaster>

<style>
	/* The stack recedes rather than stopping dead.
	 *
	 * The library shows a fixed number of notifications and hides the rest
	 * outright, so an open stack looked complete when it was not, and the older
	 * ones only reappeared as the newer ones went. Fading the far end says there
	 * is more above without inventing a counter nobody would trust.
	 *
	 * `data-visible` and `:not([data-removed])` keep this out of the way of the
	 * library's own entrance and exit, which own the opacity the rest of the time. */
	:global(
		[data-sonner-toast][data-expanded='true'][data-visible='true'][data-index='3']:not(
				[data-removed='true']
			)
	) {
		opacity: 0.66;
	}

	:global(
		[data-sonner-toast][data-expanded='true'][data-visible='true'][data-index='4']:not(
				[data-removed='true']
			)
	) {
		opacity: 0.36;
	}
</style>
