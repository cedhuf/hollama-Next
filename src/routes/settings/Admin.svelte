<script lang="ts">
	import { PlayCircle, RotateCcw } from '@lucide/svelte';
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

	import SettingsField from './SettingsField.svelte';
	import SettingsHint from './SettingsHint.svelte';
	import SettingsPanel from './SettingsPanel.svelte';
	import SettingsSection from './SettingsSection.svelte';

	// Admin = governance only. Servers are configured in the Servers tab; here the
	// admin picks which of each system server's models to share, manages users,
	// and toggles whether users may add their own providers.

	/** The governance choice repeated by every "share this with users" control. */
	/** What a user's store is made of. See `personaStoreMode` on the server. */
	const personaStoreModes = $derived([
		{ value: 'open', label: $LL.personaStoreModeOpen() },
		{ value: 'curated', label: $LL.personaStoreModeCurated() }
	]);

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

	/**
	 * How long ago, in one glance.
	 *
	 * Hours up to a day, then days, and nothing finer: the value is written at most
	 * every few minutes, so a figure in minutes would be more precise than the data
	 * behind it. Under an hour reads as "now", which is what it means in a list
	 * whose question is who is still around.
	 */
	let allowUserKeys = $state(false);
	let allowUserPersonas = $state(true);
	let personaStoreMode = $state<'open' | 'curated'>('open');

	let personaAutoUpdateForced = $state(false);
	let personaMemoryEnabled = $state(true);
	let themeSharing = $state<'off' | 'locked' | 'overridable'>('off');
	let themeShareEnabled = $state(false);
	let resettingOnboarding = $state(false);
	let servers = $state<SystemServer[]>([]);
	/** Until the first `load()` settles, the empty states below would be lies. */
	let loading = $state(true);

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

	let appPromptsSharing = $state<'off' | 'locked' | 'overridable'>('off');
	let appPromptsShareEnabled = $state(false);
	const hasOwnAppPrompts = $derived(Object.keys($settingsStore.promptOverrides ?? {}).length > 0);

	let defaultModelSharing = $state<'off' | 'locked' | 'overridable'>('off');
	let defaultModelValue = $state('');
	let titleSharing = $state<'off' | 'locked' | 'overridable'>('off');
	let titleShareEnabled = $state(false);
	let compactSharing = $state<'off' | 'locked' | 'overridable'>('off');
	let imagesSharing = $state<'off' | 'locked' | 'overridable'>('off');
	let imagesShareEnabled = $state(false);
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
			const [config, serverList] = await Promise.all([
				fetch('/api/admin/config').then((r) => r.json()),
				fetch('/api/admin/servers').then((r) => r.json())
			]);
			allowUserKeys = config.allowUserKeys;
			allowUserPersonas = config.allowUserPersonas ?? true;
			personaStoreMode = config.personaStoreMode ?? 'open';
			personaAutoUpdateForced = config.personaAutoUpdateForced ?? false;
			personaMemoryEnabled = config.personaMemoryEnabled ?? true;
			themeSharing = config.themeSharing ?? 'off';
			themeShareEnabled = themeSharing !== 'off';
			searchSharing = config.searchSharing ?? 'off';
			shareEnabled = searchSharing !== 'off';
			sharedUrl = config.searchUrl ?? '';
			webFetchSharing = config.webFetchSharing ?? 'off';
			webFetchShareEnabled = webFetchSharing !== 'off';
			systemPromptsSharing = config.systemPromptsSharing ?? 'off';
			promptsShareEnabled = systemPromptsSharing !== 'off';
			appPromptsSharing = config.appPromptsSharing ?? 'off';
			appPromptsShareEnabled = appPromptsSharing !== 'off';
			defaultModelSharing = config.defaultModelSharing ?? 'off';
			defaultModelValue = config.defaultModel ?? '';
			titleSharing = config.titleSharing ?? 'off';
			titleShareEnabled = titleSharing !== 'off';
			compactSharing = config.compactSharing ?? 'off';
			imagesSharing = config.imagesSharing ?? 'off';
			imagesShareEnabled = imagesSharing !== 'off';
			compactShareEnabled = compactSharing !== 'off';
			servers = serverList as SystemServer[];
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

	async function saveAppPrompts() {
		await api('/api/admin/config', 'PUT', {
			appPromptsSharing,
			appPrompts: $settingsStore.promptOverrides ?? {}
		});
	}

	function syncAppPromptsShare() {
		appPromptsSharing = appPromptsShareEnabled
			? appPromptsSharing === 'off'
				? 'locked'
				: appPromptsSharing
			: 'off';
		saveAppPrompts();
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
			titleServerId: model?.serverId ?? '',
			// Shared with the rest of it: an admin configures naming for themselves in
			// Chat, and this section decides who else gets that configuration. A second
			// set of controls here would be the same decision in two places.
			titleRegenerate: $settingsStore.regenerateTitle,
			titleRegenerateAfter: $settingsStore.regenerateTitleAfter
		});
	}

	function syncImagesShare() {
		imagesSharing = imagesShareEnabled
			? imagesSharing === 'off'
				? 'overridable'
				: imagesSharing
			: 'off';
		saveImagesSharing();
	}

	async function saveImagesSharing() {
		await api('/api/admin/config', 'PUT', {
			imagesSharing,
			defaultImageModel: $settingsStore.defaultImageModel ?? '',
			imagePromptWriter: $settingsStore.imagePromptWriter,
			imagePromptModel: $settingsStore.imagePromptModel ?? ''
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
		if (appPromptsShareEnabled) saveAppPrompts();
		if (titleShareEnabled) saveTitle();
		if (compactShareEnabled) saveCompact();
		if (imagesShareEnabled) saveImagesSharing();
	});

	async function toggleAllowUserKeys() {
		// `allowUserKeys` is already flipped by the toggle's binding.
		await api('/api/admin/config', 'PUT', { allowUserKeys });
	}

	async function toggleAllowUserPersonas() {
		await api('/api/admin/config', 'PUT', { allowUserPersonas });
	}

	async function savePersonaStoreMode() {
		await api('/api/admin/config', 'PUT', { personaStoreMode });
	}

	async function savePersonaAutoUpdate() {
		await api('/api/admin/config', 'PUT', { personaAutoUpdateForced });
	}

	async function savePersonaMemory() {
		await api('/api/admin/config', 'PUT', { personaMemoryEnabled });
	}

	/**
	 * The admin shares the theme they are using, the way they share their search
	 * engine and their prompts: the panel decides who gets it, the values come
	 * from this account. Nothing to pick twice.
	 */
	async function saveTheme() {
		await api('/api/admin/config', 'PUT', {
			themeSharing,
			themeMode: $settingsStore.themeMode,
			themeStyle: $settingsStore.themeStyle
		});
	}

	async function syncThemeShare() {
		themeSharing = themeShareEnabled ? 'overridable' : 'off';
		await saveTheme();
	}

	/**
	 * Play the welcome tour again, for everyone.
	 *
	 * A release note nobody can miss: what the tour says is what changed, and it
	 * appears in front of every account on its next load whether or not they have
	 * seen it before. It stamps a moment rather than clearing a flag on each
	 * person, so nothing here has to know who has seen what.
	 */
	async function askForOnboarding() {
		resettingOnboarding = true;
		try {
			await api('/api/admin/config', 'PUT', { resetOnboarding: true });
			toast.success($LL.resetOnboardingDone());
		} finally {
			resettingOnboarding = false;
		}
	}

	async function saveShared(server: SystemServer) {
		await api(`/api/admin/servers/${server.id}`, 'PUT', { sharedModels: server.sharedModels });
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
		<!-- Not a permission but a composition, which is why it is a choice of two
		     rather than a switch. A store is the door people already know; what an
		     instance decides is what is behind it. -->
		<SettingsField label={$LL.personaStoreModeLabel()}>
			<Select
				bind:value={personaStoreMode}
				options={personaStoreModes}
				onChange={savePersonaStoreMode}
			/>
		</SettingsField>
		<SettingsHint>
			{personaStoreMode === 'curated'
				? $LL.personaStoreModeCuratedHelp()
				: $LL.personaStoreModeOpenHelp()}
		</SettingsHint>

		<!-- Forced rather than defaulted: an admin who wants their people on the
		     current version of what they hand out should not have to hope each of
		     them ticked a box. Untouched personas only, here as everywhere. -->
		<FieldCheckbox
			label={$LL.personaAutoUpdateForce()}
			bind:checked={personaAutoUpdateForced}
			onChange={savePersonaAutoUpdate}
		/>
		<SettingsHint>{$LL.personaAutoUpdateForceHelp()}</SettingsHint>

		<!-- The whole feature, not a default. Off means the tools are never offered
		     and nothing is injected, so a persona here behaves as it did before
		     memory existed. What people already wrote is left where it is: erasing
		     the most personal data on the instance is not something a switch should
		     be able to do as a side effect. -->
		<FieldCheckbox
			label={$LL.personaMemoryAllow()}
			bind:checked={personaMemoryEnabled}
			onChange={savePersonaMemory}
		/>
		<SettingsHint>{$LL.personaMemoryAllowHelp()}</SettingsHint>
	</SettingsSection>

	<!-- Web search sharing -->
	<SettingsSection
		title={$LL.webSearchSharing()}
		description={$LL.webSearchSharingDescription()}
		card
	>
		{#if !$settingsStore.searchUrl}
			<span class="text-muted text-xs">{$LL.noEngineConfigured()}</span>
		{:else}
			<FieldCheckbox
				label={$LL.shareSearchEngine()}
				bind:checked={shareEnabled}
				onChange={syncShare}
			/>
			{#if shareEnabled}
				<Select bind:value={searchSharing} options={sharingOptions} onChange={saveSearch} />
				{#if sharedUrl}
					<span class="text-muted text-xs">{$LL.currentlySharing({ value: sharedUrl })}</span>
				{/if}
			{/if}
		{/if}
	</SettingsSection>

	<!-- Theme sharing -->
	<SettingsSection title={$LL.themeSharingTitle()} description={$LL.themeSharingDescription()} card>
		<FieldCheckbox
			label={$LL.shareTheme()}
			bind:checked={themeShareEnabled}
			onChange={syncThemeShare}
		/>
		{#if themeShareEnabled}
			<Select bind:value={themeSharing} options={sharingOptions} onChange={saveTheme} />
			<SettingsHint>{$LL.themeSharingHint()}</SettingsHint>
			<span class="text-muted text-xs">
				{$LL.sharingLabel()}: {$settingsStore.themeStyle} · {$settingsStore.themeMode}
			</span>
		{/if}
	</SettingsSection>

	<!-- System prompts sharing -->
	<SettingsSection
		title={$LL.systemPromptsSharing()}
		description={$LL.systemPromptsSharingDescription()}
		card
	>
		{#if !hasOwnPrompts}
			<span class="text-muted text-xs">{$LL.noPromptsConfigured()}</span>
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

	<!-- App prompt sharing -->
	<SettingsSection
		title={$LL.appPromptsSharing()}
		description={$LL.appPromptsSharingDescription()}
		card
	>
		{#if !hasOwnAppPrompts}
			<span class="text-muted text-xs">{$LL.noAppPromptsRewritten()}</span>
		{/if}

		<FieldCheckbox
			label={$LL.shareAppPrompts()}
			bind:checked={appPromptsShareEnabled}
			onChange={syncAppPromptsShare}
		/>
		{#if appPromptsShareEnabled}
			<Select bind:value={appPromptsSharing} options={sharingOptions} onChange={saveAppPrompts} />
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
			<span class="text-muted text-xs">
				{$LL.sharingLabel()}: {$settingsStore.generateTitlesWithAI
					? `${$LL.on()} — ${$settingsStore.titleModel || '—'}`
					: $LL.off()}{$settingsStore.generateTitlesWithAI && $settingsStore.regenerateTitle
					? ` · ${$LL.regenerateTitleAfterValue({ count: $settingsStore.regenerateTitleAfter })}`
					: ''}
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
			<span class="text-muted text-xs">
				{$LL.sharingLabel()}: {$settingsStore.compactModel || $LL.compactModelOwn()}
				· {$settingsStore.autoCompact
					? `${$LL.on()} — ${$settingsStore.compactThreshold.toLocaleString()}`
					: $LL.off()}
			</span>
		{/if}
	</SettingsSection>

	<!-- Image defaults sharing. Only worth showing once the instance draws at all:
	     a panel for choosing which model an instance uses for something it has
	     switched off is a panel about nothing. -->
	<!-- Sharing only, like every other feature on this tab. Whether this instance
	     draws at all is not a switch here any more: it is whether an image model is
	     marked as one and shared, which is the same decision taken where the models
	     already live rather than restated as a permission. -->
	<SettingsSection title={$LL.images()} description={$LL.imagesSharingDescription()} card>
		<FieldCheckbox
			label={$LL.shareImages()}
			bind:checked={imagesShareEnabled}
			onChange={syncImagesShare}
		/>
		{#if imagesShareEnabled}
			<Select bind:value={imagesSharing} options={sharingOptions} onChange={saveImagesSharing} />
			<span class="text-muted text-xs">
				{$LL.sharingLabel()}: {$settingsStore.defaultImageModel || $LL.defaultModel()}
				· {$settingsStore.imagePromptWriter
					? $settingsStore.imagePromptModel || $LL.defaultModel()
					: $LL.imagePromptWriterOff()}
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
			<span class="text-muted text-xs">
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
			<span class="text-muted text-sm">{$LL.noSystemServers()}</span>
		{/if}

		{#if sharedModelNames.length}
			<div class="border-shade-3 flex flex-col gap-2 rounded-md border p-3">
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
			<div class="border-shade-3 flex flex-col gap-2 rounded-md border p-3">
				<span class="text-sm font-medium">
					{server.label || server.connectionType}
					{#if !server.isEnabled}<span class="text-muted text-xs">({$LL.off()})</span>{/if}
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
					<span class="text-muted text-xs">
						{$LL.sharedCount({ count: server.sharedModels.length })}
					</span>
				{:else}
					<span class="text-muted text-xs">{$LL.noModelsCheckServersTab()}</span>
				{/if}
			</div>
		{/each}
	</SettingsSection>

	<!-- Developer options -->
	<SettingsSection title={$LL.developerOptions()} description={$LL.developerOptionsDescription()}>
		<div
			class="border-shade-3 flex items-center justify-between gap-3 rounded-md border p-3 text-sm"
		>
			<div class="flex min-w-0 flex-col">
				<span class="text-active font-medium">{$LL.newUserOnboarding()}</span>
				<span class="text-muted text-xs">{$LL.newUserOnboardingDescription()}</span>
			</div>
			<Button variant="outline" onclick={replayWelcome}>
				<PlayCircle class="base-icon" />
				{$LL.launch()}
			</Button>
		</div>

		<!-- The same tour, for everyone rather than for you. Worth its own row
		     beside the preview above: one shows you what they will see, the other
		     makes them see it. -->
		<div
			class="border-shade-3 mt-2 flex items-center justify-between gap-3 rounded-md border p-3 text-sm"
		>
			<div class="flex min-w-0 flex-col">
				<span class="text-active font-medium">{$LL.resetOnboarding()}</span>
				<span class="text-muted text-xs">{$LL.resetOnboardingHelp()}</span>
			</div>
			<Button variant="outline" disabled={resettingOnboarding} onclick={askForOnboarding}>
				<RotateCcw class="base-icon" />
				{$LL.launch()}
			</Button>
		</div>
	</SettingsSection>
</SettingsPanel>
