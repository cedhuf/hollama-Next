<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		dataTestid?: string;
		children?: Snippet;
	}

	let { dataTestid = undefined, children }: Props = $props();
</script>

<p
	class="metadata text-muted max-w-full truncate text-xs whitespace-nowrap"
	data-testid={dataTestid}
>
	{@render children?.()}
</p>
