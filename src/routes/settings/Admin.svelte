<script lang="ts">
	import { PlayCircle, Plus, RefreshCw, Trash2, X } from '@lucide/svelte';
	import { onMount } from 'svelte';
	import { toast } from 'svelte-sonner';

	import Button from '$lib/components/Button.svelte';
	import FieldCheckbox from '$lib/components/FieldCheckbox.svelte';
	import Select from '$lib/components/Select.svelte';
	import { settingsStore } from '$lib/localStorage';
	import { settingsModalOpen, welcomeOpen } from '$lib/stores/modal';

	import SettingsPanel from './SettingsPanel.svelte';
	import SettingsSection from './SettingsSection.svelte';

	// Admin = governance only. Servers are configured in the Servers tab; here the
	// admin picks which of each system server's models to share, manages users,
	// and toggles whether users may add their own providers.

	/** The governance choice repeated by every "share this with users" control. */
	const sharingOptions = (subject: string) => [
		{ value: 'locked', label: `Locked — users can't change ${subject}` },
		{ value: 'overridable', label: 'Users may override for themselves' }
	];

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

	let allowUserKeys = $state(false);
	let allowUserPersonas = $state(true);
	let servers = $state<SystemServer[]>([]);
	let users = $state<UserRow[]>([]);
	let showCreateUser = $state(false);
	let newUser = $state({ email: '', password: '', role: 'user' });

	let searchSharing = $state<'off' | 'locked' | 'overridable'>('off');
	let shareEnabled = $state(false);
	let sharedUrl = $state('');

	let systemPromptsSharing = $state<'off' | 'locked' | 'overridable'>('off');
	let promptsShareEnabled = $state(false);
	const hasOwnPrompts = $derived(
		!!$settingsStore.systemPrompts.global.trim() ||
			Object.keys($settingsStore.systemPrompts.perModel).length > 0
	);

	let defaultModelSharing = $state<'off' | 'locked' | 'overridable'>('off');
	let defaultModelValue = $state('');
	let titleSharing = $state<'off' | 'locked' | 'overridable'>('off');
	let titleShareEnabled = $state(false);

	const sharedModelNames = $derived(
		Array.from(new Set(servers.flatMap((s) => s.sharedModels))).sort((a, b) =>
			a.localeCompare(b, undefined, { sensitivity: 'base' })
		)
	);

	function syncShare() {
		searchSharing = shareEnabled ? (searchSharing === 'off' ? 'locked' : searchSharing) : 'off';
		saveSearch();
	}

	function syncPromptsShare() {
		systemPromptsSharing = promptsShareEnabled
			? systemPromptsSharing === 'off'
				? 'locked'
				: systemPromptsSharing
			: 'off';
		saveSystemPrompts();
	}

	function onDefaultModelChange() {
		if (!defaultModelValue) defaultModelSharing = 'off';
		else if (defaultModelSharing === 'off') defaultModelSharing = 'locked';
		saveDefaultModel();
	}

	function syncTitleShare() {
		titleSharing = titleShareEnabled ? (titleSharing === 'off' ? 'locked' : titleSharing) : 'off';
		saveTitle();
	}

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
		allowUserPersonas = config.allowUserPersonas ?? true;
		searchSharing = config.searchSharing ?? 'off';
		shareEnabled = searchSharing !== 'off';
		sharedUrl = config.searchUrl ?? '';
		systemPromptsSharing = config.systemPromptsSharing ?? 'off';
		promptsShareEnabled = systemPromptsSharing !== 'off';
		defaultModelSharing = config.defaultModelSharing ?? 'off';
		defaultModelValue = config.defaultModel ?? '';
		titleSharing = config.titleSharing ?? 'off';
		titleShareEnabled = titleSharing !== 'off';
		servers = (
			serverList as Pick<
				SystemServer,
				'id' | 'connectionType' | 'label' | 'isEnabled' | 'sharedModels'
			>[]
		).map((s) => ({ ...s, available: null, loadingModels: false }));
		users = userList;
	}

	// All sharing controls autosave on change (no Save buttons). The search /
	// prompts / title snapshots mirror the admin's own Chat config.
	async function saveSearch() {
		await api('/api/admin/config', 'PUT', {
			searchSharing,
			searchUrl: $settingsStore.searchUrl,
			searchBackend: $settingsStore.searchBackend,
			searchToken: $settingsStore.searchToken
		});
		sharedUrl = $settingsStore.searchUrl;
	}

	async function saveSystemPrompts() {
		await api('/api/admin/config', 'PUT', {
			systemPromptsSharing,
			systemPrompts: $settingsStore.systemPrompts
		});
	}

	async function saveDefaultModel() {
		await api('/api/admin/config', 'PUT', { defaultModelSharing, defaultModel: defaultModelValue });
	}

	async function saveTitle() {
		const model = $settingsStore.models.find((m) => m.name === $settingsStore.titleModel);
		await api('/api/admin/config', 'PUT', {
			titleSharing,
			titleEnabled: $settingsStore.generateTitlesWithAI,
			titleModel: $settingsStore.titleModel ?? '',
			titleServerId: model?.serverId ?? ''
		});
	}

	onMount(async () => {
		await load();
		// Refresh the snapshots from the admin's current Chat config on open, so
		// editing prompts/search/title there stays in sync without a Save step.
		if (shareEnabled) saveSearch();
		if (promptsShareEnabled) saveSystemPrompts();
		if (titleShareEnabled) saveTitle();
	});

	async function toggleAllowUserKeys() {
		// `allowUserKeys` is already flipped by the toggle's binding.
		await api('/api/admin/config', 'PUT', { allowUserKeys });
	}

	async function toggleAllowUserPersonas() {
		await api('/api/admin/config', 'PUT', { allowUserPersonas });
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
		saveShared(server);
	}

	async function saveShared(server: SystemServer) {
		await api(`/api/admin/servers/${server.id}`, 'PUT', { sharedModels: server.sharedModels });
	}

	async function addUser() {
		if (!newUser.email || !newUser.password) return toast.error('Email and password are required');
		await api('/api/admin/users', 'POST', newUser);
		newUser = { email: '', password: '', role: 'user' };
		showCreateUser = false;
		await load();
		toast.success('User created');
	}

	async function removeUser(id: string) {
		if (!confirm('Delete this user and all their data?')) return;
		await api(`/api/admin/users/${id}`, 'DELETE');
		await load();
	}

	/** Replay the first-connection welcome tour, so it can be reviewed on demand. */
	function replayWelcome() {
		$settingsStore.welcomeComplete = false;
		$settingsModalOpen = false;
		$welcomeOpen = true;
	}
</script>

<SettingsPanel>
	<!-- User permissions -->
	<SettingsSection
		title="User permissions"
		description="What signed-in users are allowed to do on this instance."
		card
	>
		<FieldCheckbox
			label="Allow users to add their own provider connections"
			bind:checked={allowUserKeys}
			onChange={toggleAllowUserKeys}
		/>
		<FieldCheckbox
			label="Allow users to create their own personas"
			bind:checked={allowUserPersonas}
			onChange={toggleAllowUserPersonas}
		/>
	</SettingsSection>

	<!-- Web search sharing -->
	<SettingsSection
		title="Web search sharing"
		description="Configure the search engine in the Chat tab; here you choose whether it's shared with users."
		card
	>
		{#if !$settingsStore.searchUrl}
			<span class="text-xs text-muted">
				No engine configured yet — set one up in the Chat tab first, then you can share it.
			</span>
		{:else}
			<FieldCheckbox
				label="Share my search engine with users"
				bind:checked={shareEnabled}
				onChange={syncShare}
			/>
			{#if shareEnabled}
				<Select bind:value={searchSharing} options={sharingOptions('it')} onChange={saveSearch} />
				{#if sharedUrl}<span class="text-xs text-muted">Currently sharing: {sharedUrl}</span>{/if}
			{/if}
		{/if}
	</SettingsSection>

	<!-- System prompts sharing -->
	<SettingsSection
		title="System prompts sharing"
		description="Configure your prompts in the Chat tab; here you choose whether they're shared with all users (read-only for them). Per-user prompts will come with groups."
		card
	>
		{#if !hasOwnPrompts}
			<span class="text-xs text-muted">
				Nothing configured yet — set up your prompts in the Chat tab to share something.
			</span>
		{/if}

		<FieldCheckbox
			label="Share my system prompts with users"
			bind:checked={promptsShareEnabled}
			onChange={syncPromptsShare}
		/>
		{#if promptsShareEnabled}
			<Select
				bind:value={systemPromptsSharing}
				options={sharingOptions('them')}
				onChange={saveSystemPrompts}
			/>
		{/if}
	</SettingsSection>

	<!-- Title generation sharing -->
	<SettingsSection
		title="Title generation sharing"
		description="Share your title-generation settings (from the Chat tab) with users. The title model works even if it isn't in the shared models list."
		card
	>
		<FieldCheckbox
			label="Share my title generation with users"
			bind:checked={titleShareEnabled}
			onChange={syncTitleShare}
		/>
		{#if titleShareEnabled}
			<Select bind:value={titleSharing} options={sharingOptions('it')} onChange={saveTitle} />
			<span class="text-xs text-muted">
				Sharing: {$settingsStore.generateTitlesWithAI
					? `on — ${$settingsStore.titleModel || 'no model'}`
					: 'off'}
			</span>
		{/if}
	</SettingsSection>

	<!-- Shared models -->
	<SettingsSection
		title="Shared models"
		description="Pick which models from each system server are available to users. Configure the servers themselves in the Servers tab."
	>
		{#if servers.length === 0}
			<span class="text-sm text-muted">No system servers yet — add one in the Servers tab.</span>
		{/if}

		{#if sharedModelNames.length}
			<div class="flex flex-col gap-2 rounded-md border border-shade-3 p-3">
				<span class="text-sm font-medium">Default model for users</span>
				<Select
					bind:value={defaultModelValue}
					emptyLabel="— none —"
					options={sharedModelNames.map((name) => ({ value: name, label: name }))}
					onChange={onDefaultModelChange}
				/>
				{#if defaultModelValue}
					<Select
						bind:value={defaultModelSharing}
						options={[
							{ value: 'locked', label: "Locked — users can't change it" },
							{ value: 'overridable', label: 'Default — users may change it' }
						]}
						onChange={saveDefaultModel}
					/>
				{/if}
			</div>
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
						<span class="text-xs text-muted">{server.sharedModels.length} shared</span>
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
	</SettingsSection>

	<!-- Users -->
	<SettingsSection title="Users" description="Accounts on this instance.">
		{#each users as user (user.id)}
			<div
				class="flex items-center justify-between gap-2 rounded-md border border-shade-3 p-2 text-sm"
			>
				<span>{user.email} <span class="text-xs text-muted">({user.role})</span></span>
				<Button variant="icon" onclick={() => removeUser(user.id)}>
					<Trash2 class="base-icon" />
				</Button>
			</div>
		{/each}

		{#if showCreateUser}
			<div class="flex flex-col gap-2 rounded-md border border-shade-3 p-3">
				<div class="flex items-center justify-between">
					<span class="text-sm font-medium">Create a user</span>
					<button
						type="button"
						onclick={() => (showCreateUser = false)}
						class="text-muted transition-colors hover:text-active"
						aria-label="Close"
					>
						<X class="h-4 w-4" />
					</button>
				</div>
				<input class="settings-field" type="email" bind:value={newUser.email} placeholder="Email" />
				<input
					class="settings-field"
					type="password"
					bind:value={newUser.password}
					placeholder="Initial password"
				/>
				<Select
					bind:value={newUser.role}
					options={[
						{ value: 'user', label: 'user' },
						{ value: 'admin', label: 'admin' }
					]}
				/>
				<Button onclick={addUser}><Plus class="base-icon" /> Create user</Button>
			</div>
		{:else}
			<button
				type="button"
				onclick={() => (showCreateUser = true)}
				class="flex items-center gap-2 self-start rounded-md border border-dashed border-shade-4 px-3 py-1.5 text-sm text-muted transition-colors hover:border-accent hover:text-active"
			>
				<Plus class="h-4 w-4" /> Add user
			</button>
		{/if}
	</SettingsSection>

	<!-- Developer options -->
	<SettingsSection
		title="Developer options"
		description="Tools for checking flows a user normally only sees once."
	>
		<div
			class="flex items-center justify-between gap-3 rounded-md border border-shade-3 p-3 text-sm"
		>
			<div class="flex min-w-0 flex-col">
				<span class="font-medium text-active">New-user onboarding</span>
				<span class="text-xs text-muted">
					Replay the welcome tour. Closes this dialog; finishing it marks the tour as seen again.
				</span>
			</div>
			<Button variant="outline" onclick={replayWelcome}>
				<PlayCircle class="base-icon" /> Launch
			</Button>
		</div>
	</SettingsSection>
</SettingsPanel>
