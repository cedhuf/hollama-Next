<script lang="ts">
	import type { Snippet } from 'svelte';

	/**
	 * The little grey pill that says where a setting's value comes from when it
	 * isn't the user's own: "set by admin", "env", "shared by admin".
	 *
	 * It reads as an annotation on the label, never as something clickable, which
	 * is why it stays a plain span rather than reusing `Badge` (bordered, mono,
	 * and used for identifiers elsewhere).
	 */
	let { children }: { children: Snippet } = $props();
</script>

<span class="bg-shade-2 text-muted rounded px-1.5 py-0.5 text-[11px]">{@render children()}</span>
