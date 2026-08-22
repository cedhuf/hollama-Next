<script lang="ts">
	import { Label } from 'bits-ui';

	export let name: string;
	export let disabled: boolean | undefined = false;
	export let isTextEditor: boolean | undefined = false;
	export let hasNav: boolean | undefined = false;

	// HACK: This is needed because Svelte named slots can't be conditionally rendered
	// We should be able to remove this once we upgrade to Svelte 5
	// REF https://svelte-5-preview.vercel.app/docs/snippets
	export let isLabelVisible: boolean | undefined = true;
</script>

<div
	class="field {hasNav
		? 'grid grid-cols-[auto,max-content] items-end gap-x-2'
		: 'flex flex-col'} {isTextEditor ? 'overflow-scrollbar flex-grow' : ''}"
>
	<div
		class="field-container bg-shade-0 focus-within:border-shade-6 focus-within:outline-shade-2 flex w-full flex-col gap-y-1 rounded-md border text-sm focus-within:outline {isTextEditor
			? 'flex-grow gap-y-0 p-0'
			: ''} {disabled ? 'bg-shade-1' : ''}"
	>
		{#if $$slots.label}
			<Label.Root
				for={name}
				id={`${name}-label`}
				class="field-label-root flex items-center gap-x-2 px-3 pt-3 pb-0.5 text-xs leading-none font-medium {isTextEditor
					? 'border-shade-2 border-b p-3'
					: ''} {isLabelVisible ? '' : 'hidden'}"
			>
				<slot name="label" />
			</Label.Root>
		{/if}

		<slot />
	</div>

	<slot name="nav" />
	<slot name="help" />
</div>
