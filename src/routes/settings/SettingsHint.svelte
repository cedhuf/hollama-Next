<script lang="ts">
	import type { Snippet } from 'svelte';

	/** Explanatory text under a control that is not wrapped in a `SettingsField`. Same typography as that hint and as a section description, so all help text reads at one level. */
	let { children }: { children: Snippet } = $props();
</script>

<p class="text-muted text-xs leading-snug">{@render children()}</p>
