<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		confirmDeletion?: boolean;
		headline: Snippet;
		nav: Snippet;
		/** Float over the scrolling content with a translucent, blurred background. */
		floating?: boolean;
	}

	let { confirmDeletion = false, headline, nav, floating = false }: Props = $props();
</script>

<header
	class="flex h-[var(--app-header-h)] shrink-0 items-center justify-between rounded-tl-xl rounded-tr-xl pl-16 pr-3 text-xs {floating
		? 'absolute inset-x-0 top-0 z-10 bg-shade-1/60 backdrop-blur-md'
		: 'border-b bg-shade-1'} {confirmDeletion ? 'confirm-deletion' : ''}"
>
	<div class="flex min-w-0 flex-1 flex-col gap-1">
		{@render headline()}
	</div>

	<nav class="flex flex-row items-center">
		{@render nav()}
	</nav>
</header>
