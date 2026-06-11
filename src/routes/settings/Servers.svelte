<script lang="ts">
	import { Plus } from '@lucide/svelte';

	import LL from '$i18n/i18n-svelte';
	import { isServerMode } from '$lib/chat/endpoint';
	import EmptyMessage from '$lib/components/EmptyMessage.svelte';
	import Fieldset from '$lib/components/Fieldset.svelte';
	import P from '$lib/components/P.svelte';
	import { ConnectionType, getDefaultServer, PROVIDERS } from '$lib/connections';
	import { serversStore } from '$lib/localStorage';

	import Connection from './Connection.svelte';
	import ServerConnections from './ServerConnections.svelte';

	let justAddedId = $state<string | null>(null);

	function addServer(connectionType: ConnectionType) {
		const server = getDefaultServer(connectionType);
		serversStore.update((servers) => [...servers, server]);
		justAddedId = server.id;
	}
</script>

{#if isServerMode}
	<ServerConnections />
{:else}
	<Fieldset>
		<P>
			<strong>{$LL.servers()}</strong>
		</P>

		<div class="provider-grid mb-5 grid grid-cols-2 gap-2 sm:grid-cols-3">
			{#each PROVIDERS as provider (provider.type)}
				<button
					type="button"
					onclick={() => addServer(provider.type)}
					class="provider-card group flex items-center gap-2 rounded-lg border border-shade-3 bg-shade-0 px-3 py-2.5 text-left transition-colors hover:border-accent hover:bg-shade-1"
				>
					<Plus class="h-4 w-4 shrink-0 text-muted transition-colors group-hover:text-accent" />
					<span class="truncate text-sm font-medium">{provider.name}</span>
				</button>
			{/each}
		</div>

		<div class="servers flex flex-col gap-y-4">
			{#if !$serversStore.length}
				<div class="col-span-full flex text-balance rounded-md border border-shade-3 text-center">
					<EmptyMessage>{$LL.noServerConnections()}</EmptyMessage>
				</div>
			{/if}

			{#each $serversStore as server (server.id)}
				<Connection
					{server}
					startEditing={server.id === justAddedId}
					onChange={() => serversStore.update((s) => [...s])}
					onDelete={() => serversStore.update((s) => s.filter((x) => x.id !== server.id))}
				/>
			{/each}
		</div>
	</Fieldset>
{/if}
