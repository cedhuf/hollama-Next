<script lang="ts">
	import type { Snippet } from 'svelte';

	// The shared shell for every settings tab: centred, width-capped, consistent
	// vertical rhythm between sections. Keeps all tabs visually aligned.
	let { children }: { children: Snippet } = $props();
</script>

<div class="mx-auto flex w-full max-w-[60ch] flex-col gap-6">
	{@render children()}
</div>
