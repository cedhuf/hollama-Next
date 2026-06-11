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
		X
	} from '@lucide/svelte';
	import { Dialog } from 'bits-ui';

	import LL from '$i18n/i18n-svelte';
	import { env } from '$env/dynamic/public';
	import { currentUser } from '$lib/stores/auth';
	import { settingsModalOpen } from '$lib/stores/modal';

	import Admin from './Admin.svelte';
	import Chat from './Chat.svelte';
	import DataManagement from './DataManagement.svelte';
	import Interface from './Interface.svelte';
	import Profile from './Profile.svelte';
	import Servers from './Servers.svelte';
	import Version from './Version.svelte';

	const serverMode = env.PUBLIC_MODE === 'server';
	const isAdmin = $derived($currentUser?.role === 'admin');

	let activeTab = $state('profile');
</script>

<Dialog.Root bind:open={$settingsModalOpen}>
	<Dialog.Portal>
		<Dialog.Overlay class="fixed inset-0 z-40 bg-black/50" />
		<Dialog.Content
			class="fixed inset-0 z-50 m-auto flex h-[600px] max-h-[85vh] w-[90vw] max-w-3xl overflow-hidden rounded-xl bg-shade-1 shadow-xl"
		>
			<Dialog.Close
				class="absolute right-3 top-3 z-10 rounded-md p-1.5 text-muted transition-colors hover:bg-shade-2 hover:text-active"
				aria-label="Close"
			>
				<X class="h-4 w-4" />
			</Dialog.Close>

			<div class="flex w-full flex-col sm:flex-row">
				<nav
					class="flex shrink-0 gap-1 overflow-x-auto border-b border-shade-2 bg-shade-0 p-2 pr-12 sm:w-48 sm:flex-col sm:overflow-visible sm:border-b-0 sm:border-r sm:p-3 sm:pr-3"
				>
					<div class="mb-3 hidden items-center gap-2 px-2 text-xs font-semibold text-muted sm:flex">
						<Settings2 class="h-4 w-4" />
						{$LL.settings()}
					</div>

					<button
						onclick={() => (activeTab = 'profile')}
						class="flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors hover:bg-shade-2 {activeTab ===
						'profile'
							? 'bg-shade-2 font-medium'
							: ''}"
					>
						<User class="h-4 w-4" />
						{$LL.profile()}
					</button>

					<button
						onclick={() => (activeTab = 'servers')}
						class="flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors hover:bg-shade-2 {activeTab ===
						'servers'
							? 'bg-shade-2 font-medium'
							: ''}"
					>
						<Server class="h-4 w-4" />
						{$LL.servers()}
					</button>

					{#if serverMode && isAdmin}
						<button
							onclick={() => (activeTab = 'admin')}
							class="flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors hover:bg-shade-2 {activeTab ===
							'admin'
								? 'bg-shade-2 font-medium'
								: ''}"
						>
							<Shield class="h-4 w-4" />
							Admin
						</button>
					{/if}

					<button
						onclick={() => (activeTab = 'chat')}
						class="flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors hover:bg-shade-2 {activeTab ===
						'chat'
							? 'bg-shade-2 font-medium'
							: ''}"
					>
						<MessageSquare class="h-4 w-4" />
						Chat
					</button>

					<button
						onclick={() => (activeTab = 'interface')}
						class="flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors hover:bg-shade-2 {activeTab ===
						'interface'
							? 'bg-shade-2 font-medium'
							: ''}"
					>
						<Settings2 class="h-4 w-4" />
						{$LL.interface()}
					</button>

					<button
						onclick={() => (activeTab = 'data')}
						class="flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors hover:bg-shade-2 {activeTab ===
						'data'
							? 'bg-shade-2 font-medium'
							: ''}"
					>
						<Database class="h-4 w-4" />
						Data
					</button>

					<button
						onclick={() => (activeTab = 'version')}
						class="flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors hover:bg-shade-2 {activeTab ===
						'version'
							? 'bg-shade-2 font-medium'
							: ''}"
					>
						<Info class="h-4 w-4" />
						About
					</button>

					{#if serverMode}
						<form method="POST" action="/auth/signout" class="shrink-0 sm:mt-auto">
							<input type="hidden" name="callbackUrl" value="/login" />
							<button
								type="submit"
								class="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-muted transition-colors hover:bg-shade-2 hover:text-active"
							>
								<LogOut class="h-4 w-4" />
								Sign out
							</button>
						</form>
					{/if}
				</nav>

				<div class="flex-1 overflow-auto p-4">
					{#if activeTab === 'servers'}
						<Servers />
					{:else if activeTab === 'admin'}
						<Admin />
					{:else if activeTab === 'chat'}
						<Chat />
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
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>
