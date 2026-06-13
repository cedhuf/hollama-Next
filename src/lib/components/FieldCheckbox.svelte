<script lang="ts">
	interface Props {
		label: string;
		checked?: boolean;
		name?: string;
		disabled?: boolean;
		/** Called with the new value after the user toggles. */
		onChange?: (checked: boolean) => void;
	}

	let { label, checked = $bindable(), name = '', disabled = false, onChange }: Props = $props();
</script>

<label
	class="flex w-full cursor-pointer items-center justify-between gap-3 text-balance text-sm leading-tight {disabled
		? 'cursor-not-allowed opacity-60'
		: ''}"
>
	<span>{label}</span>
	<input
		type="checkbox"
		bind:checked
		{name}
		{disabled}
		onchange={(e) => onChange?.(e.currentTarget.checked)}
		class="peer sr-only"
	/>
	<span
		class="relative h-5 w-9 shrink-0 rounded-full bg-shade-3 transition-colors after:absolute after:left-0.5 after:top-0.5 after:h-4 after:w-4 after:rounded-full after:bg-white after:transition-transform peer-checked:bg-accent peer-checked:after:translate-x-4"
	></span>
</label>
