<script lang="ts">
	export let label: string;
	export let checked: boolean | undefined = undefined;
	export let name: string = '';
	export let disabled: boolean = false;
</script>

<label
	class="inline-flex flex-grow cursor-pointer items-center gap-2.5 text-balance text-sm leading-tight {disabled
		? 'cursor-not-allowed opacity-60'
		: ''}"
>
	<input type="checkbox" bind:checked {name} {disabled} on:change class="peer sr-only" />
	<span
		class="relative h-5 w-9 shrink-0 rounded-full bg-shade-3 transition-colors after:absolute after:left-0.5 after:top-0.5 after:h-4 after:w-4 after:rounded-full after:bg-white after:transition-transform peer-checked:bg-accent peer-checked:after:translate-x-4"
	></span>
	{label}
</label>
