<script lang="ts">
	export let label: string;
	export let checked: boolean | undefined = undefined;
	export let name: string = '';
</script>

<label
	class="field-checkbox inline-flex flex-grow items-center gap-x-2 text-balance rounded-md border border-shade-4 px-3 py-2 text-sm leading-tight hover:border-shade-6 hover:text-active"
>
	<input type="checkbox" bind:checked class="field-checkbox__input accent-accent" {name} />
	{label}
</label>
