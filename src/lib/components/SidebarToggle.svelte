<script lang="ts">
	import { PanelLeft } from '@lucide/svelte';

	import LL from '$i18n/i18n-svelte';
	import { mobileDrawerOpen } from '$lib/stores/sidebar';

	interface Props {
		/**
		 * Which shape the control takes, which follows what is around it.
		 *
		 * `inline` sits inside a bar and is drawn like the other controls in it.
		 * `floating` stands on the page with nothing behind it but the conversation,
		 * so it carries its own material and its own shadow.
		 *
		 * One component rather than two, because everything that matters about it is
		 * the same in both: the label, the action, and being the single way to open
		 * the column on a phone. Written twice, the two drifted the day one of them
		 * was restyled.
		 */
		variant?: 'inline' | 'floating';
	}

	let { variant = 'inline' }: Props = $props();
</script>

<!-- The single mobile affordance to open the sidebar drawer. It lives at the top-left of
     every page, so the control never roams. Hidden on desktop, where the sidebar is
     always present. -->
<button
	type="button"
	onclick={() => mobileDrawerOpen.set(true)}
	aria-label={$LL.expandSidebar()}
	class={variant === 'floating'
		? 'surface-floating border-shade-3 text-muted hover:text-active pointer-events-auto flex h-12 w-12 shrink-0 items-center justify-center rounded-full border shadow-lg transition-colors [--surface-tint:66%] lg:hidden'
		: 'text-muted hover:text-active -ml-1 shrink-0 rounded-lg p-2 transition-colors lg:hidden'}
>
	<PanelLeft class="h-5 w-5" />
</button>
