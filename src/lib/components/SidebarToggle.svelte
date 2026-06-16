<script lang="ts">
	import { PanelLeft } from '@lucide/svelte';

	import LL from '$i18n/i18n-svelte';
	import { mobileDrawerOpen } from '$lib/stores/sidebar';

	let { class: className = '' }: { class?: string } = $props();
</script>

<!-- Opens the sidebar drawer on mobile; hidden on desktop where the rail is always visible. -->
<button
	type="button"
	onclick={() => mobileDrawerOpen.set(true)}
	class="shrink-0 rounded-lg p-2 text-muted transition-colors hover:text-active lg:hidden {className}"
	aria-label={$LL.expandSidebar()}
	title={$LL.expandSidebar()}
>
	<PanelLeft class="h-5 w-5" />
</button>
