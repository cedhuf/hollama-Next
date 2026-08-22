<script lang="ts">
	import LL from '$i18n/i18n-svelte';
	import { isServerMode } from '$lib/chat/endpoint';
	import { chatDefaultsConfig } from '$lib/chatDefaults';
	import FieldCheckbox from '$lib/components/FieldCheckbox.svelte';
	import ModelSelect from '$lib/components/ModelSelect.svelte';
	import Select from '$lib/components/Select.svelte';
	import { documentsDisabledByInstance } from '$lib/documents';
	import { canDrawImages } from '$lib/images';
	import { settingsStore } from '$lib/localStorage';
	import { personasConfig, saveStoreUrl } from '$lib/personasConfig';
	import { searchConfig } from '$lib/search';
	import { DEFAULT_STORE } from '$lib/store';
	import { webFetchConfig } from '$lib/webFetch';

	import SettingsBadge from './SettingsBadge.svelte';
	import SettingsField from './SettingsField.svelte';
	import SettingsHint from './SettingsHint.svelte';
	import SettingsLink from './SettingsLink.svelte';
	import SettingsPanel from './SettingsPanel.svelte';
	import SettingsSection from './SettingsSection.svelte';
	import SettingsSlider from './SettingsSlider.svelte';

	const imagesCfg = $derived($chatDefaultsConfig.images);

	// Show the section unless we're a server user with nothing configured yet.
	const showSearch = $derived($searchConfig.editable || $searchConfig.available);
	const canOverride = $derived(
		$searchConfig.editable && $searchConfig.source === 'user' && !!$searchConfig.adminUrl
	);

	function restoreServerDefault() {
		$settingsStore.searchUrl = '';
	}

	/**
	 * The persona store's address, which belongs to whoever owns the instance.
	 *
	 * Local mode: your own preference, and your browser is what fetches it. Server
	 * mode: the instance's, fetched by the server, so it is shown to everyone and
	 * writable only by an admin. Same field, two owners, which is why the value and
	 * the writer are read separately rather than both from the settings store.
	 */
	const storeEditable = $derived(!isServerMode || $personasConfig.canEditStore);
	const storeValue = $derived(isServerMode ? $personasConfig.storeUrl : $settingsStore.storeUrl);

	function setStoreUrl(value: string) {
		if (isServerMode) void saveStoreUrl(value);
		else $settingsStore.storeUrl = value;
	}
</script>

<SettingsPanel>
	<SettingsSection title={$LL.webSearch()} card>
		{#snippet badge()}
			{#if $searchConfig.source === 'env'}
				<SettingsBadge>env</SettingsBadge>
			{:else if $searchConfig.source === 'admin' && !$searchConfig.editable}
				<SettingsBadge>{$LL.sharedByAdminBadge()}</SettingsBadge>
			{/if}
		{/snippet}

		{#if showSearch}
			<SettingsField label={$LL.webSearchBackendUrl()}>
				<input
					class="settings-field disabled:opacity-60"
					disabled={!$searchConfig.editable}
					value={$searchConfig.editable ? $settingsStore.searchUrl : $searchConfig.url}
					placeholder={$searchConfig.adminUrl || 'http://localhost:4444'}
					oninput={(e) => ($settingsStore.searchUrl = e.currentTarget.value)}
				/>
			</SettingsField>

			<SettingsField label={$LL.webSearchBackend()}>
				<Select
					disabled={!$searchConfig.editable}
					value={$searchConfig.editable ? $settingsStore.searchBackend : $searchConfig.backend}
					options={[
						{ value: 'degoog', label: 'degoog' },
						{ value: 'searxng', label: 'SearXNG' }
					]}
					onChange={(option) =>
						($settingsStore.searchBackend = option.value as 'degoog' | 'searxng')}
				/>
			</SettingsField>

			<SettingsField label={$LL.webSearchToken()}>
				<input
					class="settings-field disabled:opacity-60"
					type="password"
					disabled={!$searchConfig.editable}
					value={$searchConfig.editable ? $settingsStore.searchToken : ''}
					placeholder={!$searchConfig.editable && $searchConfig.hasToken
						? $LL.webSearchTokenSet()
						: ''}
					oninput={(e) => ($settingsStore.searchToken = e.currentTarget.value)}
				/>
			</SettingsField>

			{#if canOverride}
				<SettingsLink onclick={restoreServerDefault}>{$LL.restoreServerDefault()}</SettingsLink>
			{/if}

			<div class="mt-1 flex flex-col gap-2">
				<FieldCheckbox
					label={$LL.webSearchByDefault()}
					bind:checked={$settingsStore.webSearchByDefault}
				/>
				<FieldCheckbox label={$LL.webSearchAuto()} bind:checked={$settingsStore.webSearchAuto} />
				<SettingsHint>{$LL.webSearchAutoHelp()}</SettingsHint>
			</div>
		{:else}
			<SettingsHint>{$LL.webSearchUnavailable()}</SettingsHint>
		{/if}
	</SettingsSection>

	<SettingsSection title={$LL.nativeToolsTitle()} description={$LL.nativeToolsDescription()} card>
		<SettingsField label={$LL.nativeToolsLabel()}>
			<Select
				value={$settingsStore.nativeTools}
				options={[
					{ value: 'off', label: $LL.nativeToolsOff() },
					{ value: 'auto', label: $LL.nativeToolsAuto() },
					{ value: 'force', label: $LL.nativeToolsForce() }
				]}
				onChange={(option) =>
					($settingsStore.nativeTools = option.value as 'off' | 'auto' | 'force')}
			/>
		</SettingsField>
		<SettingsHint>{$LL.nativeToolsHelp()}</SettingsHint>
	</SettingsSection>

	<SettingsSection title={$LL.webFetchTitle()} description={$LL.webFetchDescription()} card>
		{#if $webFetchConfig.editable}
			<FieldCheckbox label={$LL.webFetchToggle()} bind:checked={$settingsStore.webFetchEnabled} />
			{#if $settingsStore.webFetchEnabled}
				<FieldCheckbox
					label={$LL.webFetchByDefault()}
					bind:checked={$settingsStore.webFetchByDefault}
				/>
				<SettingsField label={$LL.webFetchMaxPages()}>
					<SettingsSlider
						label={$LL.webFetchMaxPages()}
						min={1}
						max={10}
						bind:value={$settingsStore.webFetchMaxPages}
					/>
				</SettingsField>
				<SettingsField label={$LL.webFetchMaxChars()}>
					<SettingsSlider
						label={$LL.webFetchMaxChars()}
						min={5000}
						max={100000}
						step={5000}
						format={(v) => `${Math.round(v / 1000)}k`}
						bind:value={$settingsStore.webFetchMaxChars}
					/>
				</SettingsField>
			{/if}
		{:else}
			<!-- Locked by the admin: `/api/fetch` applies the same policy, so this is
			     a statement of fact rather than a disabled control. -->
			<div class="flex items-center gap-2">
				<SettingsBadge>{$LL.sharedByAdminBadge()}</SettingsBadge>
				<span class="text-muted text-xs">
					{$webFetchConfig.available
						? $LL.webFetchLockedOn({ pages: $webFetchConfig.maxPages })
						: $LL.webFetchLockedOff()}
				</span>
			</div>
		{/if}
		<SettingsHint>{$LL.webFetchHint()}</SettingsHint>
	</SettingsSection>

	<!-- The store, once: one address serves every catalogue under it, so mirroring
	     it is one folder and one field rather than one of each per kind. -->
	<SettingsSection title={$LL.store()} description={$LL.storeDescription()} card>
		{#snippet badge()}
			{#if isServerMode && !$personasConfig.canEditStore}
				<SettingsBadge>{$LL.sharedByAdminBadge()}</SettingsBadge>
			{/if}
		{/snippet}

		<SettingsField label={$LL.storeUrl()}>
			<input
				class="settings-field disabled:opacity-60"
				disabled={!storeEditable}
				value={storeValue}
				placeholder={DEFAULT_STORE}
				spellcheck="false"
				onchange={(e) => setStoreUrl(e.currentTarget.value)}
			/>
		</SettingsField>
		<SettingsHint>{$LL.storeUrlHelp()}</SettingsHint>
	</SettingsSection>

	<SettingsSection title={$LL.personas()} description={$LL.personaStoreDescription()} card>
		<!-- Forced by the instance: shown as on and not offered, rather than hidden,
		     so the behaviour is explained rather than merely happening. -->
		<FieldCheckbox
			label={$LL.personaAutoUpdate()}
			checked={$personasConfig.autoUpdateForced || $settingsStore.personaAutoUpdate}
			disabled={$personasConfig.autoUpdateForced}
			onChange={(value) => ($settingsStore.personaAutoUpdate = value)}
		/>
		<SettingsHint>
			{$personasConfig.autoUpdateForced
				? $LL.personaAutoUpdateForcedHelp()
				: $LL.personaAutoUpdateHelp()}
		</SettingsHint>

		<!-- Only about several in one message: calling one persona is unaffected, and
		     calling them in separate messages was always sequential by definition. -->
		<FieldCheckbox
			label={$LL.mentionsSequential()}
			bind:checked={$settingsStore.mentionsSequential}
		/>
		<SettingsHint>{$LL.mentionsSequentialHelp()}</SettingsHint>
	</SettingsSection>

	<SettingsSection
		title={$LL.interactiveChoicesTitle()}
		description={$LL.interactiveChoicesDescription()}
		card
	>
		<FieldCheckbox
			label={$LL.interactiveChoicesToggle()}
			bind:checked={$settingsStore.interactiveChoices}
		/>
	</SettingsSection>

	{#if !documentsDisabledByInstance}
		<SettingsSection title={$LL.documentsTitle()} description={$LL.documentsDescription()} card>
			<FieldCheckbox label={$LL.documentsToggle()} bind:checked={$settingsStore.documentsEnabled} />
			<SettingsHint>{$LL.documentsHelp()}</SettingsHint>

			{#if $settingsStore.documentsEnabled}
				<FieldCheckbox label={$LL.documentOcrToggle()} bind:checked={$settingsStore.documentOcr} />
				<!-- The disclaimer is the point of this block: OCR is the one part of
				     document reading that is slow, approximate, and, unless the instance
				     hosts the engine itself, fetched from elsewhere on first use. -->
				<SettingsHint>{$LL.documentOcrHelp()}</SettingsHint>

				{#if $settingsStore.documentOcr}
					<SettingsField label={$LL.documentOcrLanguage()} hint={$LL.documentOcrLanguageHelp()}>
						<input
							class="settings-field"
							bind:value={$settingsStore.documentOcrLanguage}
							placeholder="eng"
							spellcheck="false"
						/>
					</SettingsField>
				{/if}
			{/if}
		</SettingsSection>
	{/if}

	<!-- Only where drawing is possible at all. The gallery already hides itself on
	     the same three conditions; a settings section for a feature with no page
	     behind it would be the one place it still looked available. -->
	{#if $canDrawImages}
		<SettingsSection title={$LL.images()} description={$LL.imagesSettingsDescription()} card>
			{#snippet badge()}
				{#if !imagesCfg.editable}
					<SettingsBadge>{$LL.setByAdmin()}</SettingsBadge>
				{/if}
			{/snippet}

			{#if imagesCfg.editable}
				<SettingsField label={$LL.defaultImageModel()} hint={$LL.defaultImageModelHelp()}>
					<ModelSelect
						value={imagesCfg.defaultImageModel || undefined}
						kinds={['image']}
						emptyLabel={$LL.defaultModel()}
						onSelect={(name) => ($settingsStore.defaultImageModel = name || null)}
					/>
				</SettingsField>

				<!-- A switch turns it off, and the field below says which model does it.
				     Blank there means the model you normally use, like every other model
				     field in the app. -->
				<FieldCheckbox
					label={$LL.imagePromptWriter()}
					bind:checked={$settingsStore.imagePromptWriter}
				/>
				<SettingsHint>{$LL.imagePromptWriterHelp()}</SettingsHint>

				<!-- On by default, unlike the writer above it, and the two are not the same
				     trade: a rewrite changes what gets drawn, a title changes nothing and
				     costs a dozen tokens beside a request billed by the minute. -->
				<FieldCheckbox label={$LL.imageAutoTitle()} bind:checked={$settingsStore.imageAutoTitle} />
				<SettingsHint>{$LL.imageAutoTitleHelp()}</SettingsHint>

				{#if $settingsStore.imagePromptWriter || $settingsStore.imageAutoTitle}
					<SettingsField label={$LL.imagePromptWriterModel()}>
						<ModelSelect
							value={imagesCfg.imagePromptModel || undefined}
							emptyLabel={$LL.defaultModel()}
							onSelect={(name) => ($settingsStore.imagePromptModel = name || null)}
						/>
					</SettingsField>
				{/if}
			{:else}
				<SettingsField label={$LL.defaultImageModel()}>
					<input
						class="settings-field"
						disabled
						value={imagesCfg.defaultImageModel || $LL.defaultModel()}
					/>
				</SettingsField>
				<SettingsField label={$LL.imagePromptWriter()}>
					<input
						class="settings-field"
						disabled
						value={imagesCfg.imagePromptWriter
							? imagesCfg.imagePromptModel || $LL.defaultModel()
							: $LL.imagePromptWriterOff()}
					/>
				</SettingsField>
			{/if}
		</SettingsSection>
	{/if}

	<!-- No description: the title names the thing and the switch says what it does.
	     A third sentence explaining why a model needs telling the date is a page of
	     the documentation, not a line of this one. -->
	<SettingsSection title={$LL.currentDateTitle()} card>
		<FieldCheckbox label={$LL.currentDateToggle()} bind:checked={$settingsStore.sendCurrentDate} />
	</SettingsSection>
</SettingsPanel>
