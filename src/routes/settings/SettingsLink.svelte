<script lang="ts">
	import type { Snippet } from 'svelte';

	/** A small inline action inside a settings panel. Not a `Button`: these sit in the flow of a section, and a bordered control would outweigh the setting they act on. */
	interface Props {
		onclick: () => void;
		/** Push the action to the right of its row. */
		align?: 'start' | 'end';
		/** Small leading icon, rendered as a snippet so the caller picks it. */
		icon?: Snippet;
		children: Snippet;
	}

	let { onclick, align = 'start', icon, children }: Props = $props();
</script>

<button
	type="button"
	{onclick}
	class="text-link flex w-fit shrink-0 items-center gap-1.5 text-xs {align === 'end'
		? 'ml-auto'
		: ''}"
>
	{@render icon?.()}
	{@render children()}
</button>
