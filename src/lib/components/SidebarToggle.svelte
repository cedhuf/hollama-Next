<script lang="ts">
	import { PanelLeft } from '@lucide/svelte';

	import LL from '$i18n/i18n-svelte';
	import { mobileDrawerOpen } from '$lib/stores/sidebar';

	interface Props {
		/**
		 * Which shape the control takes, which follows what is around it. `inline` sits
		 * inside a bar and is drawn like the controls in it; `floating` stands on the
		 * page with nothing behind it, so it carries its own material and shadow.
		 *
		 * One component rather than two: the label, the action and being the single way
		 * to open the column on a phone are the same in both.
		 */
		variant?: 'inline' | 'floating';
	}

	let { variant = 'inline' }: Props = $props();
</script>

<!-- The single mobile affordance to open the sidebar drawer, at the top-left of
     every page so the control never roams. Hidden on desktop. -->
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
