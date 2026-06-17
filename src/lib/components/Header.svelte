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

<!-- One solid header bar everywhere: same design on mobile and desktop, and shared by
     classic conversations, personas and knowledge entries (no floating variant). -->
<header
	class="flex h-[var(--app-header-h)] shrink-0 items-center justify-between rounded-tl-xl rounded-tr-xl border-b bg-shade-1 px-3 text-xs {confirmDeletion
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
