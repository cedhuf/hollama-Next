<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		children: Snippet;
	}

	let { children }: Props = $props();
</script>

<div class="text-muted my-2 flex flex-col gap-y-1 px-0.5">
	{@render children()}
</div>
