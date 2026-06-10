<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		legend?: Snippet;
		children?: Snippet;
	}

	let { legend, children }: Props = $props();
</script>

<fieldset
	class="fieldset container mx-auto flex max-w-[80ch] flex-col gap-y-3 {legend
		? 'fieldset--with-legend rounded-md border border-shade-4 p-4'
		: ''}"
>
	{#if legend}
		<legend class="fieldset__legend flex items-stretch gap-x-2">
			{@render legend?.()}
		</legend>
	{/if}

	{@render children?.()}
</fieldset>
