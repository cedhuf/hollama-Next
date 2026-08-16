<script lang="ts">
	import SidebarToggle from './SidebarToggle.svelte';
</script>

<!-- The top of a page that has no header of its own: home and the library.

     Nothing but the control, standing on the page, in the band a conversation's
     floating bar uses and at the same height. That is the whole of the
     harmonisation: one object, one place, whichever page you are on. The strip it
     replaced was an opaque bar the width of the screen, which on a phone showing a
     wallpaper was a band of paint across the top of it.

     It belongs inside the page's scroller, which is what makes it float rather than
     merely look like it. The control carries a translucent material and filters what
     is behind it; given a strip of its own in the flow there is nothing behind it to
     filter, and the same material reads as a solid disc laid on the page. Sticky, the
     page passes under it, exactly as the conversation passes under its pill.

     Sticky rather than laid on top, for the reason the conversation's bar is: it
     stays in the flow and reserves its own room, so nothing has to be padded for it
     and nothing has to know how tall it is. The band lets pointer events through so
     the page beside the control stays reachable. -->
<header class="floating-band pointer-events-none sticky top-0 z-20 flex shrink-0 lg:hidden">
	<SidebarToggle variant="floating" />
</header>
