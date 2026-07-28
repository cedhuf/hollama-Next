<script lang="ts">
	import type { LocalizedString } from 'typesafe-i18n';

	import Field from '$lib/components/Field.svelte';
	import Select, {
		type SelectOption,
		type SelectOptionOrGroup
	} from '$lib/components/Select.svelte';

	/**
	 * A labelled form field wrapping `Select`. It exists only for the `Field` chrome
	 * (label + optional side nav); the dropdown itself is the shared primitive, so
	 * every list in the app behaves identically.
	 */
	let {
		name,
		label,
		disabled = false,
		options = [] as SelectOptionOrGroup[],
		value = $bindable(),
		placeholder = '',
		allowClear = true,
		allowSearch = true,
		isLabelVisible = true,
		onChange = () => {},
		nav
	}: {
		name: string;
		label: LocalizedString;
		disabled?: boolean;
		options?: SelectOptionOrGroup[];
		value?: string;
		placeholder?: string;
		allowClear?: boolean;
		allowSearch?: boolean;
		isLabelVisible?: boolean;
		onChange?: (value: SelectOption) => void;
		nav?: import('svelte').Snippet;
	} = $props();

	const isDisabled = $derived(disabled || options.length === 0);
</script>

<Field {name} disabled={isDisabled} hasNav={!!nav} {isLabelVisible}>
	<svelte:fragment slot="label">{label}</svelte:fragment>

	<Select
		id={name}
		bind:value
		{options}
		{placeholder}
		{allowClear}
		searchable={allowSearch}
		searchPlaceholder={placeholder}
		disabled={isDisabled}
		class="border-0 bg-transparent px-3 py-2.5"
		{onChange}
	/>

	<svelte:fragment slot="nav">
		{#if nav}
			{@render nav()}
		{/if}
	</svelte:fragment>
</Field>
