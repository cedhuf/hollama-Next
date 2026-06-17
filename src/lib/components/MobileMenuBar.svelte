<script lang="ts">
	import SidebarToggle from './SidebarToggle.svelte';
</script>

<!-- Blank mobile-only top bar carrying just the sidebar toggle, for pages without their
     own header (home, library). Gone on desktop, where the sidebar is always visible. -->
<header class="flex h-[var(--app-header-h)] shrink-0 items-center bg-shade-1 px-3 lg:hidden">
	<SidebarToggle />
</header>
