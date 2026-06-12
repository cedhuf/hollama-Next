<script lang="ts">
	import { Plus, RefreshCw, Trash2 } from '@lucide/svelte';
	import { onMount } from 'svelte';
	import { toast } from 'svelte-sonner';

	import Button from '$lib/components/Button.svelte';
	import P from '$lib/components/P.svelte';
	import { settingsStore } from '$lib/localStorage';

	// Admin = governance only. Servers are configured in the Servers tab; here the
	// admin picks which of each system server's models to share, manages users,
	// and toggles whether users may add their own providers.

	interface SystemServer {
		id: string;
		connectionType: string;
		label: string | null;
		isEnabled: boolean;
		sharedModels: string[];
		available: string[] | null;
		loadingModels: boolean;
	}
	interface UserRow {
		id: string;
		email: string;
		role: string;
		created_at: string;
	}

	const input =
		'w-full rounded-md border border-shade-3 bg-shade-0 px-2.5 py-1.5 text-sm outline-none focus:border-accent';

	let allowUserKeys = $state(false);
	let servers = $state<SystemServer[]>([]);
	let users = $state<UserRow[]>([]);
	let newUser = $state({ email: '', password: '', role: 'user' });

	let searchSharing = $state<'off' | 'locked' | 'overridable'>('off');
	let sharedUrl = $state('');

	async function api<T>(url: string, method: string, body?: unknown): Promise<T | null> {
		const response = await fetch(url, {
			method,
			headers: body ? { 'content-type': 'application/json' } : {},
			body: body ? JSON.stringify(body) : undefined
		});
		if (!response.ok) {
			toast.error('Request failed', { description: `HTTP ${response.status}` });
			throw new Error(`HTTP ${response.status}`);
		}
		return response.status === 204 ? null : ((await response.json()) as T);
	}

	async function load() {
		const [config, serverList, userList] = await Promise.all([
			fetch('/api/admin/config').then((r) => r.json()),
			fetch('/api/admin/servers').then((r) => r.json()),
			fetch('/api/admin/users').then((r) => r.json())
		]);
		allowUserKeys = config.allowUserKeys;
		searchSharing = config.searchSharing ?? 'off';
		sharedUrl = config.searchUrl ?? '';
		servers = (
			serverList as Pick<
				SystemServer,
				'id' | 'connectionType' | 'label' | 'isEnabled' | 'sharedModels'
			>[]
		).map((s) => ({ ...s, available: null, loadingModels: false }));
		users = userList;
	}

	async function saveSearch() {
		// Share the admin's own search config (configured in the Chat tab).
		await api('/api/admin/config', 'PUT', {
			searchSharing,
			searchUrl: $settingsStore.searchUrl,
			searchBackend: $settingsStore.searchBackend,
			searchToken: $settingsStore.searchToken
		});
		sharedUrl = $settingsStore.searchUrl;
		toast.success('Web search sharing saved');
	}

	onMount(load);

	async function toggleAllowUserKeys() {
		const next = !allowUserKeys;
		await api('/api/admin/config', 'PUT', { allowUserKeys: next });
		allowUserKeys = next;
	}

	async function loadModels(server: SystemServer) {
		server.loadingModels = true;
		try {
			const models = (await api<string[]>(`/api/admin/servers/${server.id}/models`, 'GET')) ?? [];
			server.available = Array.from(new Set([...models, ...server.sharedModels])).sort((a, b) =>
				a.localeCompare(b, undefined, { sensitivity: 'base' })
			);
			if (models.length === 0)
				toast.info('No models returned (check the server in the Servers tab)');
		} finally {
			server.loadingModels = false;
		}
	}

	function toggleShared(server: SystemServer, model: string) {
		server.sharedModels = server.sharedModels.includes(model)
			? server.sharedModels.filter((m) => m !== model)
			: [...server.sharedModels, model];
	}

	async function saveShared(server: SystemServer) {
		await api(`/api/admin/servers/${server.id}`, 'PUT', { sharedModels: server.sharedModels });
		toast.success('Shared models updated');
	}

	async function addUser() {
		if (!newUser.email || !newUser.password) return toast.error('Email and password are required');
		await api('/api/admin/users', 'POST', newUser);
		newUser = { email: '', password: '', role: 'user' };
		await load();
		toast.success('User created');
	}

	async function removeUser(id: string) {
		if (!confirm('Delete this user and all their data?')) return;
		await api(`/api/admin/users/${id}`, 'DELETE');
		await load();
	}
</script>

<div class="flex flex-col gap-6">
	<!-- General -->
	<section class="flex flex-col gap-2">
		<P><strong>Administration</strong></P>
		<label class="flex items-center gap-2 text-sm">
			<input type="checkbox" checked={allowUserKeys} onchange={toggleAllowUserKeys} />
			Allow users to add their own provider connections
		</label>
	</section>

	<!-- Web search sharing -->
	<section class="flex flex-col gap-2">
		<P><strong>Web search sharing</strong></P>
		<span class="-mt-1 text-xs text-muted">
			Configure the search engine in the <strong>Chat</strong> tab; here you choose whether it's shared
			with users.
		</span>

		{#if !$settingsStore.searchUrl}
			<span class="text-xs text-muted">
				No engine configured yet — set one up in the Chat tab first, then you can share it.
			</span>
		{:else}
			<select class={input} bind:value={searchSharing}>
				<option value="off">Not shared — each user configures their own</option>
				<option value="locked">Shared and locked — users can't change it</option>
				<option value="overridable">Shared — users may override for themselves</option>
			</select>
			{#if sharedUrl && searchSharing !== 'off'}
				<span class="text-xs text-muted">Currently sharing: {sharedUrl}</span>
			{/if}
			<div><Button on:click={saveSearch}>Save sharing</Button></div>
		{/if}
	</section>

	<!-- Shared models -->
	<section class="flex flex-col gap-3">
		<P><strong>Shared models</strong></P>
		<span class="-mt-2 text-xs text-muted">
			Pick which models from each system server are available to users. Configure the servers
			themselves in the <strong>Servers</strong> tab.
		</span>

		{#if servers.length === 0}
			<span class="text-sm text-muted">No system servers yet — add one in the Servers tab.</span>
		{/if}

		{#each servers as server (server.id)}
			<div class="flex flex-col gap-2 rounded-md border border-shade-3 p-3">
				<div class="flex items-center justify-between gap-2">
					<span class="text-sm font-medium">
						{server.label || server.connectionType}
						{#if !server.isEnabled}<span class="text-xs text-muted">(disabled)</span>{/if}
					</span>
					<button
						type="button"
						onclick={() => loadModels(server)}
						disabled={server.loadingModels}
						class="flex items-center gap-1 text-xs text-link hover:underline disabled:opacity-50"
					>
						<RefreshCw class="h-3 w-3 {server.loadingModels ? 'animate-spin' : ''}" />
						{server.available ? 'Reload models' : 'Load models'}
					</button>
				</div>

				{#if server.available}
					{#if server.available.length}
						<div class="max-h-44 overflow-auto rounded-md border border-shade-3 p-1">
							{#each server.available as model (model)}
								<label
									class="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm hover:bg-shade-2"
								>
									<input
										type="checkbox"
										checked={server.sharedModels.includes(model)}
										onchange={() => toggleShared(server, model)}
									/>
									{model}
								</label>
							{/each}
						</div>
						<div>
							<Button on:click={() => saveShared(server)}>
								Save ({server.sharedModels.length} shared)
							</Button>
						</div>
					{:else}
						<span class="text-xs text-muted">No models found.</span>
					{/if}
				{:else}
					<div class="flex flex-wrap gap-1">
						{#if server.sharedModels.length}
							{#each server.sharedModels as model (model)}
								<span class="rounded bg-shade-2 px-2 py-0.5 text-xs">{model}</span>
							{/each}
						{:else}
							<span class="text-xs text-muted">No models shared yet.</span>
						{/if}
					</div>
				{/if}
			</div>
		{/each}
	</section>

	<!-- Users -->
	<section class="flex flex-col gap-3">
		<P><strong>Users</strong></P>
		{#each users as user (user.id)}
			<div
				class="flex items-center justify-between gap-2 rounded-md border border-shade-3 p-2 text-sm"
			>
				<span>{user.email} <span class="text-xs text-muted">({user.role})</span></span>
				<Button variant="icon" on:click={() => removeUser(user.id)}>
					<Trash2 class="base-icon" />
				</Button>
			</div>
		{/each}

		<div class="flex flex-col gap-2 rounded-md border border-dashed border-shade-4 p-3">
			<span class="text-sm font-medium">Create a user</span>
			<input class={input} type="email" bind:value={newUser.email} placeholder="Email" />
			<input
				class={input}
				type="password"
				bind:value={newUser.password}
				placeholder="Initial password"
			/>
			<select class={input} bind:value={newUser.role}>
				<option value="user">user</option>
				<option value="admin">admin</option>
			</select>
			<div>
				<Button on:click={addUser}><Plus class="base-icon" /> Create user</Button>
			</div>
		</div>
	</section>
</div>
