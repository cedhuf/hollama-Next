<script lang="ts">
	import {
		ArrowLeft,
		Database,
		Info,
		LogOut,
		MessageSquare,
		Server,
		Settings2,
		Shield,
		User,
		Wrench,
		X
	} from '@lucide/svelte';
	import type { Component } from 'svelte';

	import LL from '$i18n/i18n-svelte';
	import { env } from '$env/dynamic/public';
	import Modal from '$lib/components/Modal.svelte';
	import { currentUser } from '$lib/stores/auth';
	import { settingsBack, settingsModalOpen } from '$lib/stores/modal';

	import Admin from './Admin.svelte';
	import Chat from './Chat.svelte';
	import DataManagement from './DataManagement.svelte';
	import Interface from './Interface.svelte';
	import Profile from './Profile.svelte';
	import Servers from './Servers.svelte';
	import Tools from './Tools.svelte';
	import Version from './Version.svelte';

	const serverMode = env.PUBLIC_MODE === 'server';
	const isAdmin = $derived($currentUser?.role === 'admin');

	let activeTab = $state('profile');

	interface Tab {
		id: string;
		label: string;
		icon: Component<{ class?: string }>;
		visible?: boolean;
	}

	const tabs = $derived<Tab[]>(
		[
			{ id: 'profile', label: $LL.profile(), icon: User },
			{ id: 'servers', label: $LL.servers(), icon: Server },
			{ id: 'admin', label: 'Admin', icon: Shield, visible: serverMode && isAdmin },
			{ id: 'chat', label: 'Chat', icon: MessageSquare },
			{ id: 'tools', label: 'Tools', icon: Wrench },
			{ id: 'interface', label: $LL.interface(), icon: Settings2 },
			{ id: 'data', label: 'Data', icon: Database },
			{ id: 'version', label: 'About', icon: Info }
		].filter((t) => t.visible !== false)
	);

	let tabEls: Record<string, HTMLButtonElement> = {};

	// Roving arrow-key navigation across the tab list.
	function onTablistKeydown(e: KeyboardEvent) {
		const keys = ['ArrowDown', 'ArrowRight', 'ArrowUp', 'ArrowLeft'];
		if (!keys.includes(e.key)) return;
		e.preventDefault();
		const idx = tabs.findIndex((t) => t.id === activeTab);
		if (idx < 0) return;
		const step = e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : -1;
		const next = tabs[(idx + step + tabs.length) % tabs.length];
		activeTab = next.id;
		tabEls[next.id]?.focus();
	}
</script>

<Modal bind:open={$settingsModalOpen} closeButton={false}>
	<div class="flex w-full flex-col sm:flex-row">
		<div
			class="flex shrink-0 flex-col border-b border-shade-2 bg-shade-0 sm:w-48 sm:border-b-0 sm:border-r"
		>
			<!-- Sidebar header: title at left, same height as the panel header on the right. -->
			<div
				class="flex h-12 shrink-0 items-center justify-between gap-2 border-b border-shade-2 px-3"
			>
				<div class="flex items-center gap-2 text-sm font-semibold text-muted">
					<Settings2 class="h-4 w-4" />
					{$LL.settings()}
				</div>
				<!-- The panel-side close (X) is desktop-only, so the mobile close lives here. -->
				<button
					type="button"
					onclick={() => ($settingsModalOpen = false)}
					aria-label="Close"
					class="rounded-md p-1.5 text-muted transition-colors hover:bg-shade-2 hover:text-active sm:hidden"
				>
					<X class="h-4 w-4" />
				</button>
			</div>

			<div
				role="tablist"
				aria-label={$LL.settings()}
				tabindex={-1}
				onkeydown={onTablistKeydown}
				class="flex touch-pan-x gap-1 overflow-x-auto p-2 sm:flex-1 sm:touch-auto sm:flex-col sm:overflow-visible sm:p-3"
			>
				{#each tabs as tab (tab.id)}
					{@const Icon = tab.icon}
					{@const active = activeTab === tab.id}
					<button
						bind:this={tabEls[tab.id]}
						role="tab"
						aria-selected={active}
						aria-controls="settings-panel"
						tabindex={active ? 0 : -1}
						onclick={() => (activeTab = tab.id)}
						class="flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors {active
							? 'bg-accent/10 font-medium text-accent'
							: 'text-base hover:bg-shade-2'}"
					>
						<Icon class="h-4 w-4 shrink-0" />
						{tab.label}
					</button>
				{/each}

				{#if serverMode}
					<form method="POST" action="/auth/signout" class="shrink-0 sm:mt-auto">
						<input type="hidden" name="callbackUrl" value="/login" />
						<button
							type="submit"
							class="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-muted transition-colors hover:bg-shade-2 hover:text-active"
						>
							<LogOut class="h-4 w-4 shrink-0" />
							Sign out
						</button>
					</form>
				{/if}
			</div>
		</div>

		<!-- Panel: matching-height header carrying the close (X), aligned with the sidebar title. -->
		<!-- min-h-0 so the flex-1 panel stays bounded in the mobile column layout, letting
		     the inner content scroll instead of overflowing (desktop is a row, unaffected). -->
		<div class="flex min-h-0 min-w-0 flex-1 flex-col">
			<!-- Empty on desktop but for the close button, which is why it is hidden on
			     mobile. A sub-view publishing a way back gives it something to hold, so
			     it appears at every width rather than stranding a phone in the sub-view. -->
			<div
				class="h-12 shrink-0 items-center justify-between border-b border-shade-2 px-3 {$settingsBack
					? 'flex'
					: 'hidden sm:flex'}"
			>
				{#if $settingsBack}
					<button
						type="button"
						onclick={$settingsBack.onBack}
						class="flex shrink-0 items-center gap-1.5 rounded-md px-1.5 py-1 text-sm text-muted transition-colors hover:bg-shade-2 hover:text-active"
					>
						<ArrowLeft class="h-4 w-4" />
						{$settingsBack.label}
					</button>
				{:else}
					<span></span>
				{/if}

				<!-- Mobile already has a close in the sidebar header; a second one here
				     would sit a thumb's width from the back button. -->
				<button
					type="button"
					onclick={() => ($settingsModalOpen = false)}
					aria-label="Close"
					class="hidden rounded-md p-1.5 text-muted transition-colors hover:bg-shade-2 hover:text-active sm:block"
				>
					<X class="h-4 w-4" />
				</button>
			</div>
			<div id="settings-panel" role="tabpanel" class="flex-1 overflow-auto p-4">
				{#if activeTab === 'servers'}
					<Servers />
				{:else if activeTab === 'admin'}
					<Admin />
				{:else if activeTab === 'chat'}
					<Chat />
				{:else if activeTab === 'tools'}
					<Tools />
				{:else if activeTab === 'interface'}
					<Interface />
				{:else if activeTab === 'profile'}
					<Profile />
				{:else if activeTab === 'data'}
					<DataManagement />
				{:else if activeTab === 'version'}
					<Version />
				{/if}
			</div>
		</div>
	</div>
</Modal>
