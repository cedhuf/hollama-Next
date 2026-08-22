<script lang="ts">
	import { Meter } from 'bits-ui';

	/**
	 * A measurement inside a known range: spend against an allowance.
	 *
	 * `bits-ui`'s meter rather than a coloured `div`, for the reason the element
	 * exists: a bar drawn with a width is a picture, and a screen reader is handed
	 * nothing. This one carries its value, its bounds and its label.
	 *
	 * The colour is the same reading as the context ring, deliberately — warm past
	 * two thirds, red at the top — so two gauges in the same app never mean
	 * opposite things.
	 */
	interface Props {
		value: number;
		max: number;
		label: string;
		/** Spoken instead of the raw number, e.g. "4.90 of 20". */
		valueLabel?: string;
	}

	let { value, max, label, valueLabel }: Props = $props();

	const ratio = $derived(max > 0 ? Math.min(value / max, 1) : 0);
	const tone = $derived(ratio >= 0.9 ? 'bg-red-500' : ratio >= 0.66 ? 'bg-amber-500' : 'bg-accent');
</script>

<Meter.Root
	{value}
	{max}
	aria-label={label}
	aria-valuetext={valueLabel}
	class="bg-shade-3 h-1.5 w-full overflow-hidden rounded-full"
>
	<div class="h-full transition-[width] duration-500 {tone}" style="width:{ratio * 100}%"></div>
</Meter.Root>
