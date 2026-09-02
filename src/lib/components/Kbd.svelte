<script lang="ts">
	import type { Snippet } from 'svelte';

	/** A single key as printed on a keyboard. Shared, so the shortcut list and the search dialog's footer cannot drift into two different keycaps. */
	let { children }: { children: Snippet } = $props();
</script>

<kbd
	class="border-shade-3 text-muted inline-flex min-w-5 items-center justify-center rounded border px-1 py-px font-sans text-[10px] leading-none"
>
	{@render children()}
</kbd>
