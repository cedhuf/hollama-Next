<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		dataTestid?: string;
		children?: Snippet;
	}

	let { dataTestid = undefined, children }: Props = $props();
</script>

<p
	class="metadata max-w-full truncate whitespace-nowrap text-xs text-muted"
	data-testid={dataTestid}
>
	{@render children?.()}
</p>
