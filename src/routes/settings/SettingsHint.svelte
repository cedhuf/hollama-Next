<script lang="ts">
	import type { Snippet } from 'svelte';

	/**
	 * Explanatory text under a control that isn't wrapped in a `SettingsField`,
	 * a checkbox, say. Same typography as `SettingsField`'s `hint` and
	 * `SettingsSection`'s description, so all help text reads at one level
	 * whichever of the three it happens to hang off.
	 */
	let { children }: { children: Snippet } = $props();
</script>

<p class="text-muted text-xs leading-snug">{@render children()}</p>
