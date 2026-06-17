<script lang="ts">
	import { PanelLeft } from '@lucide/svelte';

	import LL from '$i18n/i18n-svelte';
	import { mobileDrawerOpen } from '$lib/stores/sidebar';
</script>

<!-- The single mobile affordance to open the sidebar drawer. It lives at the top-left of
     every page — inside its header bar, or in a blank bar on headerless pages — so the
     control never roams. Hidden on desktop, where the sidebar is always present. -->
<button
	type="button"
	onclick={() => mobileDrawerOpen.set(true)}
	class="-ml-1 shrink-0 rounded-lg p-2 text-muted transition-colors hover:text-active lg:hidden"
	aria-label={$LL.expandSidebar()}
>
	<PanelLeft class="h-5 w-5" />
</button>
