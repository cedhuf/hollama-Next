<script lang="ts">
	import {
		Database,
		Info,
		LogOut,
		MessageSquare,
		Server,
		Settings2,
		Shield,
		User,
		Wrench
	} from '@lucide/svelte';
	import type { Component } from 'svelte';

	import LL from '$i18n/i18n-svelte';
	import { env } from '$env/dynamic/public';
	import Modal from '$lib/components/Modal.svelte';
	import { currentUser } from '$lib/stores/auth';
	import { settingsModalOpen } from '$lib/stores/modal';

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

<Modal bind:open={$settingsModalOpen}>
	<div class="flex w-full flex-col sm:flex-row">
		<div
			role="tablist"
			aria-label={$LL.settings()}
			tabindex={-1}
			onkeydown={onTablistKeydown}
			class="flex shrink-0 gap-1 overflow-x-auto border-b border-shade-2 bg-shade-0 p-2 pr-12 sm:w-48 sm:flex-col sm:overflow-visible sm:border-b-0 sm:border-r sm:p-3 sm:pr-3"
		>
			<div class="mb-3 hidden items-center gap-2 px-2 text-xs font-semibold text-muted sm:flex">
				<Settings2 class="h-4 w-4" />
				{$LL.settings()}
			</div>

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
</Modal>
