<script lang="ts">
	import type { Snippet } from 'svelte';

	/**
	 * The grey pill saying where a setting's value comes from when it is not the
	 * user's own. It reads as an annotation on the label, never as something
	 * clickable, which is why it is not `Badge`.
	 */
	let { children }: { children: Snippet } = $props();
</script>

<span class="bg-shade-2 text-muted rounded px-1.5 py-0.5 text-[11px]">{@render children()}</span>
