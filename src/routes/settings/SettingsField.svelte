<script lang="ts">
	import type { Snippet } from 'svelte';

	// One labelled form control (input / select / textarea passed as children). Unifies
	// label typography, optional badge, hint text and spacing across every settings tab.
	interface Props {
		label?: string;
		hint?: string;
		/** Small element shown next to the label, e.g. an "env" / "set by admin" tag. */
		badge?: Snippet;
		children: Snippet;
	}

	let { label, hint, badge, children }: Props = $props();
</script>

<label class="flex flex-col gap-1.5">
	{#if label}
		<span class="flex items-center gap-2 text-sm font-medium text-active">
			{label}
			{@render badge?.()}
		</span>
	{/if}
	{@render children()}
	{#if hint}
		<span class="text-xs leading-snug text-muted">{hint}</span>
	{/if}
</label>
