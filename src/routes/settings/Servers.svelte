<script lang="ts">
	import { Plus } from '@lucide/svelte';

	import LL from '$i18n/i18n-svelte';
	import { isServerMode } from '$lib/chat/endpoint';
	import EmptyMessage from '$lib/components/EmptyMessage.svelte';
	import { ConnectionType, getDefaultServer, PROVIDERS } from '$lib/connections';
	import { serversStore } from '$lib/localStorage';

	import Connection from './Connection.svelte';
	import ModelNames from './ModelNames.svelte';
	import ServerConnections from './ServerConnections.svelte';
	import SettingsPanel from './SettingsPanel.svelte';
	import SettingsSection from './SettingsSection.svelte';

	let justAddedId = $state<string | null>(null);
	/** When set, the tab shows the model-name editor for that connection instead. */
	let renamingId = $state<string | null>(null);
	const renaming = $derived($serversStore.find((s) => s.id === renamingId));

	function addServer(connectionType: ConnectionType) {
		const server = getDefaultServer(
			connectionType,
			$serversStore.map((s) => s.color)
		);
		serversStore.update((servers) => [...servers, server]);
		justAddedId = server.id;
	}
</script>

{#if isServerMode}
	<ServerConnections />
{:else if renaming}
	<ModelNames
		server={renaming}
		onBack={() => (renamingId = null)}
		onChange={() => serversStore.update((s) => [...s])}
	/>
{:else}
	<SettingsPanel>
		<SettingsSection title={$LL.servers()} description={$LL.addAServerDescription()}>
			<div class="grid grid-cols-2 gap-2 sm:grid-cols-3">
				{#each PROVIDERS as provider (provider.type)}
					<button
						type="button"
						onclick={() => addServer(provider.type)}
						class="group flex items-center gap-2 rounded-lg border border-shade-3 bg-shade-0 px-3 py-2.5 text-left transition-colors hover:bg-shade-1"
					>
						<Plus class="h-4 w-4 shrink-0 text-muted transition-colors group-hover:text-accent" />
						<span class="truncate text-sm font-medium">{provider.name}</span>
					</button>
				{/each}
			</div>
		</SettingsSection>

		<div class="flex flex-col gap-y-4">
			{#if !$serversStore.length}
				<div class="flex rounded-lg border border-shade-3 text-balance text-center">
					<EmptyMessage>{$LL.noServerConnections()}</EmptyMessage>
				</div>
			{/if}

			{#each $serversStore as server (server.id)}
				<Connection
					{server}
					startEditing={server.id === justAddedId}
					onChange={() => serversStore.update((s) => [...s])}
					onDelete={() => serversStore.update((s) => s.filter((x) => x.id !== server.id))}
					onRenameModels={() => (renamingId = server.id)}
				/>
			{/each}
		</div>
	</SettingsPanel>
{/if}
