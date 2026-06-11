<script lang="ts">
	import { Plus, RefreshCw, Trash2 } from '@lucide/svelte';
	import { onMount } from 'svelte';
	import { toast } from 'svelte-sonner';

	import Button from '$lib/components/Button.svelte';
	import P from '$lib/components/P.svelte';
	import { ConnectionType, PROVIDERS } from '$lib/connections';

	interface AdminServer {
		id: string;
		connectionType: string;
		baseUrl: string;
		label: string | null;
		modelFilter: string | null;
		isEnabled: boolean;
		hasApiKey: boolean;
		sharedModels: string[];
		// local UI state
		newKey: string;
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
	let servers = $state<AdminServer[]>([]);
	let users = $state<UserRow[]>([]);

	let newServer = $state({
		connectionType: ConnectionType.Ollama as string,
		baseUrl: '',
		label: '',
		modelFilter: '' as string | null,
		apiKey: ''
	});
	let newUser = $state({ email: '', password: '', role: 'user' });

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
		servers = (serverList as Omit<AdminServer, 'newKey' | 'available' | 'loadingModels'>[]).map(
			(s) => ({ ...s, newKey: '', available: null, loadingModels: false })
		);
		users = userList;
	}

	onMount(load);

	async function toggleAllowUserKeys() {
		const next = !allowUserKeys;
		await api('/api/admin/config', 'PUT', { allowUserKeys: next });
		allowUserKeys = next;
	}

	function selectPreset(type: string) {
		const provider = PROVIDERS.find((p) => p.type === type);
		if (!provider) return;
		newServer.connectionType = provider.type;
		newServer.baseUrl = provider.baseUrl;
		newServer.modelFilter = provider.modelFilter ?? '';
		newServer.label = provider.name;
	}

	async function addServer() {
		if (!newServer.baseUrl) return toast.error('Base URL is required');
		await api('/api/admin/servers', 'POST', {
			connectionType: newServer.connectionType,
			baseUrl: newServer.baseUrl,
			label: newServer.label || null,
			modelFilter: newServer.modelFilter || null,
			apiKey: newServer.apiKey || null,
			sharedModels: [],
			isEnabled: true
		});
		newServer = {
			connectionType: ConnectionType.Ollama,
			baseUrl: '',
			label: '',
			modelFilter: '',
			apiKey: ''
		};
		await load();
		toast.success('Server added — load its models to share them');
	}

	async function saveServer(server: AdminServer) {
		await api(`/api/admin/servers/${server.id}`, 'PUT', {
			baseUrl: server.baseUrl,
			label: server.label,
			modelFilter: server.modelFilter,
			isEnabled: server.isEnabled,
			sharedModels: server.sharedModels,
			...(server.newKey ? { apiKey: server.newKey } : {})
		});
		server.newKey = '';
		toast.success('Server saved');
	}

	async function removeServer(id: string) {
		if (!confirm('Delete this system server?')) return;
		await api(`/api/admin/servers/${id}`, 'DELETE');
		await load();
	}

	async function loadModels(server: AdminServer) {
		server.loadingModels = true;
		try {
			const models = (await api<string[]>(`/api/admin/servers/${server.id}/models`, 'GET')) ?? [];
			// Show live models, plus any already-shared model that's currently offline.
			const merged = Array.from(new Set([...models, ...server.sharedModels])).sort((a, b) =>
				a.localeCompare(b, undefined, { sensitivity: 'base' })
			);
			server.available = merged;
			if (models.length === 0) toast.info('No models returned (check the URL/key, then save)');
		} finally {
			server.loadingModels = false;
		}
	}

	function toggleShared(server: AdminServer, model: string) {
		server.sharedModels = server.sharedModels.includes(model)
			? server.sharedModels.filter((m) => m !== model)
			: [...server.sharedModels, model];
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

	<!-- System servers -->
	<section class="flex flex-col gap-3">
		<P><strong>System servers</strong></P>
		<span class="-mt-2 text-xs text-muted">
			Configure providers shared with everyone. Load each server's models and tick the ones to
			expose. Keys are encrypted at rest and never sent to the browser.
		</span>

		{#each servers as server (server.id)}
			<div class="flex flex-col gap-2 rounded-md border border-shade-3 p-3">
				<div class="flex items-center justify-between gap-2">
					<span class="text-sm font-medium">{server.label || server.connectionType}</span>
					<label class="flex items-center gap-1.5 text-xs text-muted">
						<input type="checkbox" bind:checked={server.isEnabled} /> enabled
					</label>
				</div>

				<input class={input} bind:value={server.label} placeholder="Label" />
				<input class={input} bind:value={server.baseUrl} placeholder="Base URL" />
				<input
					class={input}
					type="password"
					bind:value={server.newKey}
					placeholder={server.hasApiKey ? 'API key set — type to replace' : 'API key (optional)'}
				/>

				<!-- Shared models picker -->
				<div class="flex flex-col gap-1.5">
					<div class="flex items-center justify-between">
						<span class="text-xs font-medium text-muted">
							Shared models ({server.sharedModels.length})
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
						{:else}
							<span class="text-xs text-muted">No models found.</span>
						{/if}
					{:else if server.sharedModels.length}
						<div class="flex flex-wrap gap-1">
							{#each server.sharedModels as model (model)}
								<span class="rounded bg-shade-2 px-2 py-0.5 text-xs">{model}</span>
							{/each}
						</div>
					{/if}
				</div>

				<div class="flex gap-2">
					<Button on:click={() => saveServer(server)}>Save</Button>
					<Button variant="outline" on:click={() => removeServer(server.id)}>
						<Trash2 class="base-icon" /> Delete
					</Button>
				</div>
			</div>
		{/each}

		<!-- New server -->
		<div class="flex flex-col gap-2 rounded-md border border-dashed border-shade-4 p-3">
			<span class="text-sm font-medium">Add a system server</span>
			<div class="flex flex-wrap gap-1.5">
				{#each PROVIDERS as provider (provider.type)}
					<button
						type="button"
						onclick={() => selectPreset(provider.type)}
						class="rounded-md border px-2.5 py-1 text-xs transition-colors hover:border-shade-6 {newServer.connectionType ===
						provider.type
							? 'border-accent text-active'
							: 'border-shade-4 text-muted'}"
					>
						{provider.name}
					</button>
				{/each}
			</div>
			<input class={input} bind:value={newServer.label} placeholder="Label (optional)" />
			<input class={input} bind:value={newServer.baseUrl} placeholder="Base URL" />
			<input
				class={input}
				type="password"
				bind:value={newServer.apiKey}
				placeholder="API key (optional)"
			/>
			<div>
				<Button on:click={addServer}><Plus class="base-icon" /> Add server</Button>
			</div>
		</div>
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
