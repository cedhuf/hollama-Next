<script lang="ts">
	import { Minus, Plus } from '@lucide/svelte';

	/**
	 * A number field with our own two steppers instead of the browser's, which
	 * draws its spinner white in a dark theme, differently in every engine, and
	 * sized for nobody. Still a plain `type="number"` underneath.
	 *
	 * An empty field means "unset" everywhere it is used, which is why the value
	 * goes out as a string: `''` is an answer, and `0` is a different one.
	 */
	interface Props {
		/** The current value, or `''` when nothing is set. */
		value: number | string;
		min?: number;
		max?: number;
		step?: number;
		placeholder?: string;
		disabled?: boolean;
		/** Extra classes for the input itself, e.g. `text-right`. */
		class?: string;
		/** Accessible name, where the visible label is an icon or lives elsewhere. */
		label?: string;
		/** `type="number"` reports an empty value for "0,2", which is what half of Europe types, so a field that has to take one is a text field with a decimal keypad. The steppers read the figure, not the box. */
		decimal?: boolean;
		onChange: (raw: string) => void;
	}

	let {
		value,
		min,
		max,
		step = 1,
		placeholder,
		disabled = false,
		class: className = '',
		label,
		decimal = false,
		onChange
	}: Props = $props();

	const current = $derived(Number(String(value ?? '').replace(',', '.')));
	const hasValue = $derived(value !== '' && value !== null && Number.isFinite(current));

	/** The decimals the step implies, so 0.1 plus 0.05 does not become 0.15000000000000002. */
	const decimals = $derived((String(step).split('.')[1] ?? '').length);

	const atMin = $derived(hasValue && min !== undefined && current <= min);
	const atMax = $derived(hasValue && max !== undefined && current >= max);

	function nudge(direction: 1 | -1) {
		// From empty, the first press lands on the floor rather than one step above it:
		// the smallest accepted value is what somebody is reaching for.
		const next = hasValue ? current + direction * step : (min ?? 0);
		const clamped = Math.min(max ?? Infinity, Math.max(min ?? -Infinity, next));
		onChange(clamped.toFixed(decimals));
	}
</script>

<div
	class="border-shade-3 bg-shade-0 focus-within:border-accent flex min-h-9 w-full min-w-0 items-center rounded-md border {disabled
		? 'opacity-50'
		: ''}"
>
	{#if decimal}
		<input
			class="text-active min-w-0 flex-1 bg-transparent px-2.5 py-1.5 text-sm outline-none {className}"
			type="text"
			inputmode="decimal"
			aria-label={label}
			{disabled}
			{placeholder}
			{value}
			oninput={(event) => onChange(event.currentTarget.value)}
		/>
	{:else}
		<input
			class="text-active no-spinner min-w-0 flex-1 bg-transparent px-2.5 py-1.5 text-sm outline-none {className}"
			type="number"
			aria-label={label}
			{disabled}
			{min}
			{max}
			{step}
			{placeholder}
			{value}
			onchange={(event) => onChange(event.currentTarget.value)}
		/>
	{/if}
	<div class="flex shrink-0 items-center gap-0.5 pr-1">
		<button
			type="button"
			tabindex="-1"
			class="text-muted hover:text-active hover:bg-shade-2 rounded p-1 disabled:pointer-events-none disabled:opacity-30"
			disabled={disabled || atMin}
			onclick={() => nudge(-1)}
			aria-label="-"
		>
			<Minus class="h-3 w-3" />
		</button>
		<button
			type="button"
			tabindex="-1"
			class="text-muted hover:text-active hover:bg-shade-2 rounded p-1 disabled:pointer-events-none disabled:opacity-30"
			disabled={disabled || atMax}
			onclick={() => nudge(1)}
			aria-label="+"
		>
			<Plus class="h-3 w-3" />
		</button>
	</div>
</div>
