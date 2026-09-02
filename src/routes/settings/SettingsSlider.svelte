<script lang="ts">
	import { Slider } from 'bits-ui';

	/**
	 * A count you pick by feel rather than by typing. A number input made you aim at
	 * a 16px box and click a spinner twice to go from 3 to 5.
	 *
	 * The label is screen-reader only: under the checkbox that reveals it, a track
	 * and a number need no caption, but assistive tech still has to say what the
	 * value counts.
	 */
	interface Props {
		/** Announced to assistive tech; not drawn. */
		label: string;
		value: number;
		min?: number;
		max?: number;
		step?: number;
		/** Draws the value in place of the raw number (e.g. "20k characters"). */
		format?: (value: number) => string;
		/** Shown but not answering, when the switch above it is off. */
		disabled?: boolean;
		/** Drop the readout: for a scale with no unit anyone would quote, the number is noise, and the result is on screen behind the dialog anyway. */
		showValue?: boolean;
		/** For a scale whose centre is the default rather than an extreme: without a mark, going back to it means guessing, and a value you cannot return to is one people stop moving. */
		midpoint?: boolean;
	}

	let {
		label,
		value = $bindable(),
		min = 0,
		max = 10,
		step = 1,
		format,
		disabled = false,
		showValue = true,
		midpoint = false
	}: Props = $props();
</script>

<div class="flex items-center gap-3 {disabled ? 'pointer-events-none opacity-40' : ''}">
	<Slider.Root
		type="single"
		bind:value
		{min}
		{max}
		{step}
		{disabled}
		aria-label={label}
		class="relative flex h-5 w-full touch-none items-center select-none"
	>
		<span class="bg-shade-3 relative h-1.5 w-full grow overflow-hidden rounded-full">
			<Slider.Range class="bg-accent absolute h-full" />
			<!-- Drawn last so it reads on the filled half as well as the empty one, and in
			     the track's own background colour, which contrasts with both. -->
			{#if midpoint}
				<span class="bg-shade-0 absolute top-0 left-1/2 h-full w-0.5 -translate-x-1/2"></span>
			{/if}
		</span>
		<Slider.Thumb
			index={0}
			class="border-accent bg-shade-0 focus-visible:ring-accent focus-visible:ring-offset-shade-0 block h-4 w-4 cursor-grab rounded-full border-2 shadow-sm transition-shadow focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none active:cursor-grabbing"
		/>
	</Slider.Root>

	{#if showValue}
		<span
			class="text-active shrink-0 text-right text-sm font-medium tabular-nums {format
				? 'w-16'
				: 'w-5'}"
		>
			{format ? format(value) : value}
		</span>
	{/if}
</div>
