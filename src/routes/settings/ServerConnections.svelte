<script lang="ts">
	import { Plus } from '@lucide/svelte';
	import { onMount } from 'svelte';

	import EmptyMessage from '$lib/components/EmptyMessage.svelte';
	import P from '$lib/components/P.svelte';
	import { ConnectionType, getDefaultServer, PROVIDERS, type Server } from '$lib/connections';
	import { currentUser } from '$lib/stores/auth';

	import Connection from './Connection.svelte';

	// Server-mode Servers tab. Same rich Connection UI as local mode (presets,
	// verify, Ollama pull, model filter) — only the persistence differs: admins
	// manage shared SYSTEM servers, users their own PERSONAL servers (when
	// enabled). Which models a system server exposes is chosen in the Admin tab.

	interface ApiServer {
		id: string;
		connectionType: string;
		baseUrl?: string;
		label: string | null;
		modelFilter?: string | null;
		isEnabled: boolean;
		scope?: string;
	}

	let allowUserKeys = $state(false);
	let servers = $state<Server[]>([]);

	const isAdmin = $derived($currentUser?.role === 'admin');
	const base = $derived(isAdmin ? '/api/admin/servers' : '/api/servers');
	const canManage = $derived(isAdmin || allowUserKeys);

	function toServer(v: ApiServer): Server {
		return {
			id: v.id,
			connectionType: v.connectionType as ConnectionType,
			baseUrl: v.baseUrl ?? '',
			label: v.label ?? undefined,
			modelFilter: v.modelFilter ?? undefined,
			isEnabled: v.isEnabled,
			isVerified: null,
			apiKey: '' // never returned by the API; type to set/replace
		};
	}

	async function load() {
		const providers = await fetch('/api/providers').then((r) => r.json());
		allowUserKeys = providers.allowUserKeys;
		if (isAdmin) {
			const list: ApiServer[] = await fetch('/api/admin/servers').then((r) => r.json());
			servers = list.map(toServer);
		} else {
			servers = (providers.servers as ApiServer[])
				.filter((s) => s.scope === 'personal')
				.map(toServer);
		}
	}

	onMount(load);

	async function addServer(type: ConnectionType) {
		const preset = getDefaultServer(type);
		const created: ApiServer = await fetch(base, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				connectionType: type,
				baseUrl: preset.baseUrl,
				modelFilter: preset.modelFilter ?? null,
				isEnabled: false
			})
		}).then((r) => r.json());
		servers = [...servers, toServer(created)];
	}

	// Debounced PUT per server. The key is sent only when (re)typed.
	const timers: Record<string, ReturnType<typeof setTimeout>> = {};
	function persist(server: Server) {
		clearTimeout(timers[server.id]);
		timers[server.id] = setTimeout(() => {
			void fetch(`${base}/${server.id}`, {
				method: 'PUT',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					baseUrl: server.baseUrl,
					label: server.label ?? null,
					modelFilter: server.modelFilter ?? null,
					isEnabled: server.isEnabled,
					...(server.apiKey ? { apiKey: server.apiKey } : {})
				})
			});
		}, 500);
	}

	async function remove(server: Server) {
		await fetch(`${base}/${server.id}`, { method: 'DELETE' });
		servers = servers.filter((s) => s.id !== server.id);
	}
</script>

<div class="flex flex-col gap-4">
	<div class="flex flex-col gap-1">
		<P><strong>{isAdmin ? 'System servers' : 'Your servers'}</strong></P>
		<span class="text-xs text-muted">
			{isAdmin
				? 'Shared with everyone — choose which models to expose in the Admin tab. Keys are encrypted and never sent to the browser.'
				: 'Your own provider connections, private to your account.'}
		</span>
	</div>

	{#if !canManage}
		<div class="rounded-md border border-shade-3">
			<EmptyMessage>Providers are managed by your administrator.</EmptyMessage>
		</div>
	{:else}
		<div class="grid grid-cols-2 gap-2 sm:grid-cols-3">
			{#each PROVIDERS as provider (provider.type)}
				<button
					type="button"
					onclick={() => addServer(provider.type)}
					class="group flex items-center gap-2 rounded-lg border border-shade-3 bg-shade-0 px-3 py-2.5 text-left transition-colors hover:border-accent hover:bg-shade-1"
				>
					<Plus class="h-4 w-4 shrink-0 text-muted transition-colors group-hover:text-accent" />
					<span class="truncate text-sm font-medium">{provider.name}</span>
				</button>
			{/each}
		</div>

		<div class="flex flex-col gap-y-4">
			{#each servers as server (server.id)}
				<Connection {server} onChange={() => persist(server)} onDelete={() => remove(server)} />
			{/each}
		</div>
	{/if}
</div>
