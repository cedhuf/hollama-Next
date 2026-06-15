<script lang="ts">
	import { browser } from '$app/environment';
	import Button from '$lib/components/Button.svelte';

	export let handleSubmit;
	export let disabled: boolean | undefined = false;
	export let hasMetaKey: boolean = false;
</script>

<Button class="text-left" onclick={handleSubmit} {disabled}>
	<slot />

	{#if browser}
		<span
			class="tag ml-2.5 inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold {!disabled
				? 'border-shade-0/40'
				: ''}"
		>
			{hasMetaKey ? (navigator.userAgent.indexOf('Mac') !== -1 ? '⌘' : 'Ctrl') : ''} ↵
		</span>
	{/if}
</Button>
