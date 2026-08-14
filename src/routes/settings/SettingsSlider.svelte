<script lang="ts">
	import { Slider } from 'bits-ui';

	/**
	 * A count you pick by feel rather than by typing — "how many to show" and the
	 * like. A number input made you aim at a 16px box and click a spinner twice to
	 * go from 3 to 5; the track answers the same question in one gesture.
	 *
	 * The label is deliberately screen-reader only: sitting under the checkbox that
	 * reveals it, a track and a number need no caption. It still has to exist, so
	 * assistive tech can say what the value counts.
	 *
	 * Built on the same bits-ui primitives as the app's other controls, so keyboard,
	 * pointer and touch handling come for free.
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
	}

	let {
		label,
		value = $bindable(),
		min = 0,
		max = 10,
		step = 1,
		format,
		disabled = false
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
		class="relative flex h-5 w-full touch-none select-none items-center"
	>
		<span class="relative h-1.5 w-full grow overflow-hidden rounded-full bg-shade-3">
			<Slider.Range class="absolute h-full bg-accent" />
		</span>
		<Slider.Thumb
			index={0}
			class="block h-4 w-4 cursor-grab rounded-full border-2 border-accent bg-shade-0 shadow-sm transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-shade-0 active:cursor-grabbing"
		/>
	</Slider.Root>

	<span
		class="shrink-0 text-right text-sm font-medium tabular-nums text-active {format
			? 'w-16'
			: 'w-5'}"
	>
		{format ? format(value) : value}
	</span>
</div>
