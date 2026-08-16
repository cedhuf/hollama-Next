<script lang="ts">
	import SidebarToggle from './SidebarToggle.svelte';
</script>

<!-- The top of a page that has no header of its own: home and the library.

     Nothing but the control, standing on the page, in the gutter a conversation's
     floating bar uses and at the same height. That is the whole of the
     harmonisation: one object, one place, whichever page you are on. The strip it
     replaced was an opaque bar the width of the screen, which on a phone showing a
     wallpaper was a band of paint across the top of it.

     In flow rather than over the content, unlike the conversation's: these two pages
     scroll their own box beneath this, so there is nothing to pass under. -->
<header class="flex shrink-0 px-4 pb-2 pt-[calc(1rem+env(safe-area-inset-top))] lg:hidden">
	<SidebarToggle variant="floating" />
</header>
