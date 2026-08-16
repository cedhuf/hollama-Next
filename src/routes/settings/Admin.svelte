<script lang="ts">
	import { PlayCircle, Plus, Trash2, X } from '@lucide/svelte';
	import { onMount } from 'svelte';
	import { toast } from 'svelte-sonner';

	import LL from '$i18n/i18n-svelte';
	import Button from '$lib/components/Button.svelte';
	import FieldCheckbox from '$lib/components/FieldCheckbox.svelte';
	import MultiSelect from '$lib/components/MultiSelect.svelte';
	import Select from '$lib/components/Select.svelte';
	import Skeleton from '$lib/components/Skeleton.svelte';
	import { settingsStore } from '$lib/localStorage';
	import { settingsModalOpen, welcomeOpen } from '$lib/stores/modal';

	import SettingsPanel from './SettingsPanel.svelte';
	import SettingsSection from './SettingsSection.svelte';

	// Admin = governance only. Servers are configured in the Servers tab; here the
	// admin picks which of each system server's models to share, manages users,
	// and toggles whether users may add their own providers.

	/** The governance choice repeated by every "share this with users" control. */
	const sharingOptions = $derived([
		{ value: 'locked', label: $LL.lockedForUsers() },
		{ value: 'overridable', label: $LL.overridableForUsers() }
	]);

	interface SystemServer {
		id: string;
		connectionType: string;
		label: string | null;
		isEnabled: boolean;
		sharedModels: string[];
	}
	interface UserRow {
		id: string;
		email: string;
		role: string;
		created_at: string;
	}

	let allowUserKeys = $state(false);
	let allowUserPersonas = $state(true);
	let allowUserStoreInstall = $state(true);
	let servers = $state<SystemServer[]>([]);
	let users = $state<UserRow[]>([]);
	/** Until the first `load()` settles, the empty states below would be lies. */
	let loading = $state(true);
	let showCreateUser = $state(false);
	let newUser = $state({ email: '', password: '', role: 'user' });

	let searchSharing = $state<'off' | 'locked' | 'overridable'>('off');
	let shareEnabled = $state(false);
	let sharedUrl = $state('');

	let webFetchSharing = $state<'off' | 'locked' | 'overridable'>('off');
	let webFetchShareEnabled = $state(false);
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
	let compactSharing = $state<'off' | 'locked' | 'overridable'>('off');
	let compactShareEnabled = $state(false);

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

	function syncCompactShare() {
		compactSharing = compactShareEnabled
			? compactSharing === 'off'
				? 'locked'
				: compactSharing
			: 'off';
		saveCompact();
	}

	async function api<T>(url: string, method: string, body?: unknown): Promise<T | null> {
		const response = await fetch(url, {
			method,
			headers: body ? { 'content-type': 'application/json' } : {},
			body: body ? JSON.stringify(body) : undefined
		});
		if (!response.ok) {
			toast.error($LL.requestFailed(), { description: `HTTP ${response.status}` });
			throw new Error(`HTTP ${response.status}`);
		}
		return response.status === 204 ? null : ((await response.json()) as T);
	}

	async function load() {
		try {
			const [config, serverList, userList] = await Promise.all([
				fetch('/api/admin/config').then((r) => r.json()),
				fetch('/api/admin/servers').then((r) => r.json()),
				fetch('/api/admin/users').then((r) => r.json())
			]);
			allowUserKeys = config.allowUserKeys;
			allowUserPersonas = config.allowUserPersonas ?? true;
			allowUserStoreInstall = config.allowUserStoreInstall ?? true;
			searchSharing = config.searchSharing ?? 'off';
			shareEnabled = searchSharing !== 'off';
			sharedUrl = config.searchUrl ?? '';
			webFetchSharing = config.webFetchSharing ?? 'off';
			webFetchShareEnabled = webFetchSharing !== 'off';
			systemPromptsSharing = config.systemPromptsSharing ?? 'off';
			promptsShareEnabled = systemPromptsSharing !== 'off';
			defaultModelSharing = config.defaultModelSharing ?? 'off';
			defaultModelValue = config.defaultModel ?? '';
			titleSharing = config.titleSharing ?? 'off';
			titleShareEnabled = titleSharing !== 'off';
			compactSharing = config.compactSharing ?? 'off';
			compactShareEnabled = compactSharing !== 'off';
			servers = serverList as SystemServer[];
			users = userList;
		} finally {
			loading = false;
		}
	}

	/**
	 * Models offered by each system server. `/api/providers` already returns the
	 * full (unfiltered) list for admins — the same `listProviderModels` call the
	 * old per-server "Load models" button made — so there is nothing to fetch here.
	 * Refreshing the catalogue is done from the Servers tab.
	 */
	const availableByServer = $derived.by(() => {
		const byServer: Record<string, string[]> = {};
		for (const model of $settingsStore.models ?? []) {
			(byServer[model.serverId] ??= []).push(model.name);
		}
		return byServer;
	});

	/** Shared models are kept even if the server no longer lists them. */
	function optionsFor(server: SystemServer) {
		return (
			Array.from(new Set([...(availableByServer[server.id] ?? []), ...server.sharedModels]))
				.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
				// Deliberately the raw ids: this is the admin's sharing console, where the
				// exact model being exposed matters more than a friendly name.
				.map((model) => ({ value: model, label: model }))
		);
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

	/**
	 * Web fetch is configured once, in the Tools tab; here the admin only decides
	 * who else gets that configuration — the tool being off is shareable too, and
	 * that is what turns it off for the whole instance.
	 */
	async function saveWebFetch() {
		await api('/api/admin/config', 'PUT', {
			webFetchSharing,
			webFetchEnabled: $settingsStore.webFetchEnabled,
			webFetchMaxPages: $settingsStore.webFetchMaxPages,
			webFetchMaxChars: $settingsStore.webFetchMaxChars
		});
	}

	function syncWebFetchShare() {
		webFetchSharing = webFetchShareEnabled
			? webFetchSharing === 'off'
				? 'locked'
				: webFetchSharing
			: 'off';
		saveWebFetch();
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

	async function saveCompact() {
		const model = $settingsStore.models.find((m) => m.name === $settingsStore.compactModel);
		await api('/api/admin/config', 'PUT', {
			compactSharing,
			compactModel: $settingsStore.compactModel ?? '',
			compactServerId: model?.serverId ?? '',
			compactAuto: $settingsStore.autoCompact,
			compactThreshold: $settingsStore.compactThreshold
		});
	}

	onMount(async () => {
		await load();
		// Refresh the snapshots from the admin's current Chat config on open, so
		// editing prompts/search/title there stays in sync without a Save step.
		if (shareEnabled) saveSearch();
		if (promptsShareEnabled) saveSystemPrompts();
		if (titleShareEnabled) saveTitle();
		if (compactShareEnabled) saveCompact();
	});

	async function toggleAllowUserKeys() {
		// `allowUserKeys` is already flipped by the toggle's binding.
		await api('/api/admin/config', 'PUT', { allowUserKeys });
	}

	async function toggleAllowUserPersonas() {
		await api('/api/admin/config', 'PUT', { allowUserPersonas });
	}

	async function toggleAllowUserStoreInstall() {
		await api('/api/admin/config', 'PUT', { allowUserStoreInstall });
	}

	async function saveShared(server: SystemServer) {
		await api(`/api/admin/servers/${server.id}`, 'PUT', { sharedModels: server.sharedModels });
	}

	async function addUser() {
		if (!newUser.email || !newUser.password) return toast.error($LL.emailAndPasswordRequired());
		await api('/api/admin/users', 'POST', newUser);
		newUser = { email: '', password: '', role: 'user' };
		showCreateUser = false;
		await load();
		toast.success($LL.userCreated());
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
		title={$LL.userPermissions()}
		description={$LL.userPermissionsDescription()}
		card
	>
		<FieldCheckbox
			label={$LL.allowUserProviders()}
			bind:checked={allowUserKeys}
			onChange={toggleAllowUserKeys}
		/>
		<FieldCheckbox
			label={$LL.allowUserPersonas()}
			bind:checked={allowUserPersonas}
			onChange={toggleAllowUserPersonas}
		/>
		<!-- Two switches rather than one, because writing a persona and taking one
		     are different things to allow. A curated instance may well want people
		     installing from the store and authoring nothing. -->
		<FieldCheckbox
			label={$LL.allowUserStoreInstall()}
			bind:checked={allowUserStoreInstall}
			onChange={toggleAllowUserStoreInstall}
		/>
	</SettingsSection>

	<!-- Web search sharing -->
	<SettingsSection
		title={$LL.webSearchSharing()}
		description={$LL.webSearchSharingDescription()}
		card
	>
		{#if !$settingsStore.searchUrl}
			<span class="text-xs text-muted">{$LL.noEngineConfigured()}</span>
		{:else}
			<FieldCheckbox
				label={$LL.shareSearchEngine()}
				bind:checked={shareEnabled}
				onChange={syncShare}
			/>
			{#if shareEnabled}
				<Select bind:value={searchSharing} options={sharingOptions} onChange={saveSearch} />
				{#if sharedUrl}
					<span class="text-xs text-muted">{$LL.currentlySharing({ value: sharedUrl })}</span>
				{/if}
			{/if}
		{/if}
	</SettingsSection>

	<!-- System prompts sharing -->
	<SettingsSection
		title={$LL.systemPromptsSharing()}
		description={$LL.systemPromptsSharingDescription()}
		card
	>
		{#if !hasOwnPrompts}
			<span class="text-xs text-muted">{$LL.noPromptsConfigured()}</span>
		{/if}

		<FieldCheckbox
			label={$LL.shareSystemPrompts()}
			bind:checked={promptsShareEnabled}
			onChange={syncPromptsShare}
		/>
		{#if promptsShareEnabled}
			<Select
				bind:value={systemPromptsSharing}
				options={sharingOptions}
				onChange={saveSystemPrompts}
			/>
		{/if}
	</SettingsSection>

	<!-- Title generation sharing -->
	<SettingsSection
		title={$LL.titleGenerationSharing()}
		description={$LL.titleGenerationSharingDescription()}
		card
	>
		<FieldCheckbox
			label={$LL.shareTitleGeneration()}
			bind:checked={titleShareEnabled}
			onChange={syncTitleShare}
		/>
		{#if titleShareEnabled}
			<Select bind:value={titleSharing} options={sharingOptions} onChange={saveTitle} />
			<span class="text-xs text-muted">
				{$LL.sharingLabel()}: {$settingsStore.generateTitlesWithAI
					? `${$LL.on()} — ${$settingsStore.titleModel || '—'}`
					: $LL.off()}
			</span>
		{/if}
	</SettingsSection>

	<!-- Compaction sharing -->
	<SettingsSection
		title={$LL.compactionSharing()}
		description={$LL.compactionSharingDescription()}
		card
	>
		<FieldCheckbox
			label={$LL.shareCompaction()}
			bind:checked={compactShareEnabled}
			onChange={syncCompactShare}
		/>
		{#if compactShareEnabled}
			<Select bind:value={compactSharing} options={sharingOptions} onChange={saveCompact} />
			<span class="text-xs text-muted">
				{$LL.sharingLabel()}: {$settingsStore.compactModel || $LL.compactModelOwn()}
				· {$settingsStore.autoCompact
					? `${$LL.on()} — ${$settingsStore.compactThreshold.toLocaleString()}`
					: $LL.off()}
			</span>
		{/if}
	</SettingsSection>

	<!-- Web fetch sharing -->
	<SettingsSection
		title={$LL.webFetchSharing()}
		description={$LL.webFetchSharingDescription()}
		card
	>
		<FieldCheckbox
			label={$LL.shareWebFetch()}
			bind:checked={webFetchShareEnabled}
			onChange={syncWebFetchShare}
		/>
		{#if webFetchShareEnabled}
			<Select bind:value={webFetchSharing} options={sharingOptions} onChange={saveWebFetch} />
			<span class="text-xs text-muted">
				{$settingsStore.webFetchEnabled
					? $LL.currentlySharingWebFetch({
							pages: $settingsStore.webFetchMaxPages,
							chars: Math.round($settingsStore.webFetchMaxChars / 1000)
						})
					: $LL.currentlySharingWebFetchOff()}
			</span>
		{/if}
	</SettingsSection>

	<!-- Shared models -->
	<SettingsSection title={$LL.sharedModels()} description={$LL.sharedModelsDescription()}>
		{#if loading}
			<Skeleton variant="row" count={2} />
		{:else if servers.length === 0}
			<span class="text-sm text-muted">{$LL.noSystemServers()}</span>
		{/if}

		{#if sharedModelNames.length}
			<div class="flex flex-col gap-2 rounded-md border border-shade-3 p-3">
				<span class="text-sm font-medium">{$LL.defaultModelForUsers()}</span>
				<Select
					bind:value={defaultModelValue}
					emptyLabel={$LL.none()}
					options={sharedModelNames.map((name) => ({ value: name, label: name }))}
					onChange={onDefaultModelChange}
				/>
				{#if defaultModelValue}
					<Select
						bind:value={defaultModelSharing}
						options={[
							{ value: 'locked', label: $LL.lockedForUsers() },
							{ value: 'overridable', label: $LL.defaultUsersMayChange() }
						]}
						onChange={saveDefaultModel}
					/>
				{/if}
			</div>
		{/if}

		{#each servers as server (server.id)}
			<div class="flex flex-col gap-2 rounded-md border border-shade-3 p-3">
				<span class="text-sm font-medium">
					{server.label || server.connectionType}
					{#if !server.isEnabled}<span class="text-xs text-muted">({$LL.off()})</span>{/if}
				</span>

				{#if optionsFor(server).length}
					<MultiSelect
						value={server.sharedModels}
						searchable
						placeholder={$LL.selectModelsToShare()}
						options={optionsFor(server)}
						onChange={(selected) => {
							server.sharedModels = selected;
							saveShared(server);
						}}
					/>
					<span class="text-xs text-muted">
						{$LL.sharedCount({ count: server.sharedModels.length })}
					</span>
				{:else}
					<span class="text-xs text-muted">{$LL.noModelsCheckServersTab()}</span>
				{/if}
			</div>
		{/each}
	</SettingsSection>

	<!-- Users -->
	<SettingsSection title={$LL.users()} description={$LL.usersDescription()}>
		{#if loading}
			<Skeleton variant="row" count={3} />
		{/if}
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
					<span class="text-sm font-medium">{$LL.createAUser()}</span>
					<button
						type="button"
						onclick={() => (showCreateUser = false)}
						class="text-muted transition-colors hover:text-active"
						aria-label={$LL.close()}
					>
						<X class="h-4 w-4" />
					</button>
				</div>
				<input class="settings-field" type="email" bind:value={newUser.email} placeholder="Email" />
				<input
					class="settings-field"
					type="password"
					bind:value={newUser.password}
					placeholder={$LL.initialPassword()}
				/>
				<Select
					bind:value={newUser.role}
					options={[
						{ value: 'user', label: 'user' },
						{ value: 'admin', label: 'admin' }
					]}
				/>
				<Button onclick={addUser}><Plus class="base-icon" /> {$LL.createUser()}</Button>
			</div>
		{:else}
			<button
				type="button"
				onclick={() => (showCreateUser = true)}
				class="flex items-center gap-2 self-start rounded-md border border-dashed border-shade-4 px-3 py-1.5 text-sm text-muted transition-colors hover:border-accent hover:text-active"
			>
				<Plus class="h-4 w-4" />
				{$LL.addUser()}
			</button>
		{/if}
	</SettingsSection>

	<!-- Developer options -->
	<SettingsSection title={$LL.developerOptions()} description={$LL.developerOptionsDescription()}>
		<div
			class="flex items-center justify-between gap-3 rounded-md border border-shade-3 p-3 text-sm"
		>
			<div class="flex min-w-0 flex-col">
				<span class="font-medium text-active">{$LL.newUserOnboarding()}</span>
				<span class="text-xs text-muted">{$LL.newUserOnboardingDescription()}</span>
			</div>
			<Button variant="outline" onclick={replayWelcome}>
				<PlayCircle class="base-icon" />
				{$LL.launch()}
			</Button>
		</div>
	</SettingsSection>
</SettingsPanel>
