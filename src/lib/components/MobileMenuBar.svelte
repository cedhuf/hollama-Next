<script lang="ts">
	import SidebarToggle from './SidebarToggle.svelte';
</script>

<!-- Blank mobile-only top bar carrying just the sidebar toggle, for pages without their
     own header (home, library). Gone on desktop, where the sidebar is always visible. -->
<header
	class="flex h-[calc(var(--app-header-h)+env(safe-area-inset-top))] shrink-0 items-center bg-shade-1 px-3 pt-[env(safe-area-inset-top)] lg:hidden"
>
	<SidebarToggle />
</header>
