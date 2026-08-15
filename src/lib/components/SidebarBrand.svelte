<script lang="ts">
	import { PanelLeftClose } from '@lucide/svelte';

	import LL from '$i18n/i18n-svelte';
	import { resolve } from '$app/paths';
	import { APP_NAME } from '$lib/brand';

	import Logo from './Logo.svelte';

	interface Props {
		/** The collapsed desktop rail keeps the mark and drops the name. */
		rail: boolean;
		onCollapse: () => void;
	}

	let { rail, onCollapse }: Props = $props();
</script>

<!-- The top edge of the column, and the densest of its materials along with the
     footer: edges read as edges by being more solid than what they enclose. -->
<div
	class="flex h-[var(--app-header-h)] shrink-0 border-b surface-chrome max-lg:h-[calc(var(--app-header-h)+env(safe-area-inset-top))]"
>
	<!-- The block paints out to the frame's edge; its contents stop at the width the
	     column is going to. Two jobs that used to be one and had to be separated: laid
	     out at the target width, a block leaves the frame unpainted while the column
	     is still narrowing; laid out at the frame's width, it re-wraps itself sixty
	     times a second on the way there. -->
	<div
		class="flex h-full w-full shrink-0 items-center px-4 max-lg:pt-[env(safe-area-inset-top)] {rail
			? 'lg:w-16'
			: 'lg:w-96'}"
	>
		{#if rail}
			<!-- The mark holds the corner at the same size it does at full width, so the
		     column keeps its identity when it narrows rather than looking like a
		     smaller version of itself. Widening it again is the handle's business, and
		     the handle is not in here: it sits astride the column's edge. -->
			<a href={resolve('/sessions')} aria-label={APP_NAME} class="flex w-full justify-center">
				<Logo class="h-8 w-8 shrink-0" />
			</a>
		{:else}
			<a href={resolve('/sessions')} class="flex items-center gap-2">
				<Logo class="h-8 w-8 shrink-0" />
				<span class="whitespace-nowrap text-lg font-semibold tracking-tight">{APP_NAME}</span>
			</a>
			<button
				onclick={onCollapse}
				class="ml-auto rounded-lg p-2 text-muted transition-colors hover:text-active"
				aria-label={$LL.collapseSidebar()}
				title={$LL.collapseSidebar()}
			>
				<PanelLeftClose class="h-5 w-5" />
			</button>
		{/if}
	</div>
</div>
