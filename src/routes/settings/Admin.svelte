<script lang="ts">
	import { Plus, Trash2 } from '@lucide/svelte';
	import { onMount } from 'svelte';
	import { toast } from 'svelte-sonner';

	import Button from '$lib/components/Button.svelte';
	import P from '$lib/components/P.svelte';
	import { ConnectionType } from '$lib/connections';

	interface AdminServer {
		id: string;
		connectionType: string;
		baseUrl: string;
		label: string | null;
		modelFilter: string | null;
		isEnabled: boolean;
		hasApiKey: boolean;
		sharedModels: string[];
		// local editing fields
		sharedModelsText: string;
		newKey: string;
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
		connectionType: ConnectionType.OpenAI as string,
		baseUrl: '',
		apiKey: '',
		label: '',
		sharedModels: '',
		isEnabled: true
	});
	let newUser = $state({ email: '', password: '', role: 'user' });

	const parseModels = (text: string) =>
		text
			.split(/[\n,]/)
			.map((m) => m.trim())
			.filter(Boolean);

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
		servers = (serverList as Omit<AdminServer, 'sharedModelsText' | 'newKey'>[]).map((s) => ({
			...s,
			sharedModelsText: s.sharedModels.join(', '),
			newKey: ''
		}));
		users = userList;
	}

	onMount(load);

	async function toggleAllowUserKeys() {
		const next = !allowUserKeys;
		await api('/api/admin/config', 'PUT', { allowUserKeys: next });
		allowUserKeys = next;
	}

	async function addServer() {
		if (!newServer.baseUrl) return toast.error('Base URL is required');
		await api('/api/admin/servers', 'POST', {
			connectionType: newServer.connectionType,
			baseUrl: newServer.baseUrl,
			apiKey: newServer.apiKey || null,
			label: newServer.label || null,
			sharedModels: parseModels(newServer.sharedModels),
			isEnabled: newServer.isEnabled
		});
		newServer = {
			connectionType: ConnectionType.OpenAI,
			baseUrl: '',
			apiKey: '',
			label: '',
			sharedModels: '',
			isEnabled: true
		};
		await load();
		toast.success('Server added');
	}

	async function saveServer(server: AdminServer) {
		await api(`/api/admin/servers/${server.id}`, 'PUT', {
			baseUrl: server.baseUrl,
			label: server.label,
			modelFilter: server.modelFilter,
			isEnabled: server.isEnabled,
			sharedModels: parseModels(server.sharedModelsText),
			...(server.newKey ? { apiKey: server.newKey } : {})
		});
		await load();
		toast.success('Server saved');
	}

	async function removeServer(id: string) {
		if (!confirm('Delete this system server?')) return;
		await api(`/api/admin/servers/${id}`, 'DELETE');
		await load();
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
			Shared with every user. Pick which models to expose (comma-separated). Keys are stored
			encrypted and never sent to the browser.
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
					bind:value={server.sharedModelsText}
					placeholder="Shared models, comma-separated"
				/>
				<input
					class={input}
					type="password"
					bind:value={server.newKey}
					placeholder={server.hasApiKey ? 'API key set — type to replace' : 'API key (optional)'}
				/>
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
			<select class={input} bind:value={newServer.connectionType}>
				{#each Object.values(ConnectionType) as type (type)}
					<option value={type}>{type}</option>
				{/each}
			</select>
			<input class={input} bind:value={newServer.label} placeholder="Label (optional)" />
			<input class={input} bind:value={newServer.baseUrl} placeholder="Base URL" />
			<input
				class={input}
				type="password"
				bind:value={newServer.apiKey}
				placeholder="API key (optional)"
			/>
			<input
				class={input}
				bind:value={newServer.sharedModels}
				placeholder="Shared models, comma-separated"
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
