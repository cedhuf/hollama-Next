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
		/** Indent under the checkbox that reveals it. */
		indented?: boolean;
	}

	let { label, value = $bindable(), min = 0, max = 10, indented = false }: Props = $props();
</script>

<div class="flex items-center gap-3 {indented ? 'pl-11' : ''}">
	<Slider.Root
		type="single"
		bind:value
		{min}
		{max}
		step={1}
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

	<span class="w-5 shrink-0 text-right text-sm font-medium tabular-nums text-active">{value}</span>
</div>
