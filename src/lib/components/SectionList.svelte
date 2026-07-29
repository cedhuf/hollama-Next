<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		children?: Snippet;
	}

	let { children }: Props = $props();
</script>

<!-- `gap` so two adjacent highlights (hover next to active) never touch: their
     rounded corners butting together reads as a rendering glitch. -->
<nav class="flex flex-col gap-0.5">
	{@render children?.()}
</nav>
