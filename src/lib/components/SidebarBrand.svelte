<script lang="ts">
	import { PanelLeft, PanelLeftClose } from '@lucide/svelte';

	import LL from '$i18n/i18n-svelte';
	import { resolve } from '$app/paths';
	import { APP_NAME } from '$lib/brand';

	import Logo from './Logo.svelte';

	interface Props {
		/** The collapsed desktop rail has room for one button and no name. */
		rail: boolean;
		onExpand: () => void;
		onCollapse: () => void;
	}

	let { rail, onExpand, onCollapse }: Props = $props();
</script>

<!-- The top edge of the column, and the densest of its materials along with the
     footer: edges read as edges by being more solid than what they enclose. -->
<div class="flex h-[var(--app-header-h)] shrink-0 items-center border-b px-4 surface-chrome">
	{#if rail}
		<div class="flex w-full justify-center">
			<button
				onclick={onExpand}
				class="rounded-lg p-2 text-muted transition-colors hover:text-active"
				aria-label={$LL.expandSidebar()}
				title={$LL.expandSidebar()}
			>
				<PanelLeft class="h-5 w-5" />
			</button>
		</div>
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
