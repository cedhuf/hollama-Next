<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		label: string;
		/** Small element shown after the label, e.g. an "alpha" tag. */
		badge?: Snippet;
		checked?: boolean;
		name?: string;
		disabled?: boolean;
		/** Called with the new value after the user toggles. */
		onChange?: (checked: boolean) => void;
	}

	let {
		label,
		badge,
		checked = $bindable(),
		name = '',
		disabled = false,
		onChange
	}: Props = $props();
</script>

<label
	class="flex w-full cursor-pointer items-center justify-between gap-3 text-sm leading-tight text-balance {disabled
		? 'cursor-not-allowed opacity-60'
		: ''}"
>
	<span class="flex items-center gap-2">
		{label}
		{@render badge?.()}
	</span>
	<input
		type="checkbox"
		bind:checked
		{name}
		{disabled}
		onchange={(e) => onChange?.(e.currentTarget.checked)}
		class="peer sr-only"
	/>
	<span
		class="bg-shade-3 peer-checked:bg-accent relative h-5 w-9 shrink-0 rounded-full transition-colors after:absolute after:top-0.5 after:left-0.5 after:h-4 after:w-4 after:rounded-full after:bg-white after:transition-transform peer-checked:after:translate-x-4"
	></span>
</label>
