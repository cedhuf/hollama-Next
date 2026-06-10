<script lang="ts">
	import { Dialog } from 'bits-ui';
	import { Database, Info, Server, Settings2, User, X } from 'lucide-svelte';

	import LL from '$i18n/i18n-svelte';
	import { settingsModalOpen } from '$lib/stores/modal';

	import DataManagement from './DataManagement.svelte';
	import Interface from './Interface.svelte';
	import Profile from './Profile.svelte';
	import Servers from './Servers.svelte';
	import Version from './Version.svelte';

	let activeTab = $state('servers');
</script>

<Dialog.Root bind:open={$settingsModalOpen}>
	<Dialog.Portal>
		<Dialog.Overlay class="fixed inset-0 z-40 bg-black/50" />
		<Dialog.Content
			class="fixed inset-0 z-50 m-auto flex max-h-[85vh] w-[90vw] max-w-4xl overflow-hidden rounded-xl bg-shade-1 shadow-xl"
		>
			<div class="flex w-full">
				<nav class="flex w-48 shrink-0 flex-col gap-1 border-r border-shade-2 bg-shade-0 p-3">
					<div class="mb-3 flex items-center justify-between px-2">
						<div class="flex items-center gap-2 text-xs font-semibold text-muted">
							<Settings2 class="h-4 w-4" />
							{$LL.settings()}
						</div>
						<Dialog.Close class="rounded p-1 hover:bg-shade-2">
							<X class="h-4 w-4" />
						</Dialog.Close>
					</div>

					<button
						onclick={() => (activeTab = 'servers')}
						class="flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors hover:bg-shade-2 {activeTab === 'servers'
							? 'bg-shade-2 font-medium'
							: ''}"
					>
						<Server class="h-4 w-4" />
						{$LL.servers()}
					</button>

					<button
						onclick={() => (activeTab = 'interface')}
						class="flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors hover:bg-shade-2 {activeTab === 'interface'
							? 'bg-shade-2 font-medium'
							: ''}"
					>
						<Settings2 class="h-4 w-4" />
						{$LL.interface()}
					</button>

					<button
						onclick={() => (activeTab = 'profile')}
						class="flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors hover:bg-shade-2 {activeTab === 'profile'
							? 'bg-shade-2 font-medium'
							: ''}"
					>
						<User class="h-4 w-4" />
						{$LL.profile()}
					</button>

					<button
						onclick={() => (activeTab = 'data')}
						class="flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors hover:bg-shade-2 {activeTab === 'data'
							? 'bg-shade-2 font-medium'
							: ''}"
					>
						<Database class="h-4 w-4" />
						Data
					</button>

					<button
						onclick={() => (activeTab = 'version')}
						class="flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors hover:bg-shade-2 {activeTab === 'version'
							? 'bg-shade-2 font-medium'
							: ''}"
					>
						<Info class="h-4 w-4" />
						About
					</button>
				</nav>

				<div class="flex-1 overflow-auto p-4">
					{#if activeTab === 'servers'}
						<Servers />
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
