<script lang="ts">
	import type { Snippet } from 'svelte';

	import SidebarToggle from './SidebarToggle.svelte';

	interface Props {
		confirmDeletion?: boolean;
		headline: Snippet;
		nav: Snippet;
	}

	let { confirmDeletion = false, headline, nav }: Props = $props();
</script>

<!-- One header bar everywhere: same design on mobile and desktop, for classic
     conversations and for personas alike.

     It floats over what it heads rather than sitting above it, like the sidebar's
     own bars, so the conversation passes under it and its material has something
     to show. Whoever renders it owes the content below `--app-header-h` of top
     padding; the positioning context is the page shell it sits in. -->
<header
	class="surface-chrome absolute inset-x-0 top-0 z-20 flex h-[var(--app-header-h)] items-center justify-between rounded-tl-xl rounded-tr-xl border-b px-3 text-xs {confirmDeletion
		? 'confirm-deletion'
		: ''}"
>
	<SidebarToggle />
	<div class="flex min-w-0 flex-1 items-center gap-2">
		<div class="flex min-w-0 flex-1 flex-col gap-1">
			{@render headline()}
		</div>
	</div>

	<nav class="flex flex-row items-center">
		{@render nav()}
	</nav>
</header>
