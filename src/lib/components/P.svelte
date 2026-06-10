<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		children?: Snippet;
	}

	let { children }: Props = $props();
</script>

<p class="p text-sm">
	{@render children?.()}
</p>

<style>
	.p :global(strong) {
		font-weight: 500;
		line-height: 1;
	}
</style>
