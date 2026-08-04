<script lang="ts">
	import LL from '$i18n/i18n-svelte';
	import { APP_NAME } from '$lib/brand';
	import FieldCheckbox from '$lib/components/FieldCheckbox.svelte';
	import Select from '$lib/components/Select.svelte';
	import { DEFAULT_PROMPTS, PROMPT_KEYS, type PromptKey } from '$lib/defaultPrompts';
	import { documentsDisabledByInstance } from '$lib/documents';
	import { settingsStore } from '$lib/localStorage';
	import { searchConfig } from '$lib/search';
	import { webFetchConfig } from '$lib/webFetch';

	import SettingsBadge from './SettingsBadge.svelte';
	import SettingsField from './SettingsField.svelte';
	import SettingsHint from './SettingsHint.svelte';
	import SettingsLink from './SettingsLink.svelte';
	import SettingsPanel from './SettingsPanel.svelte';
	import SettingsSection from './SettingsSection.svelte';
	import SettingsSlider from './SettingsSlider.svelte';

	// Show the section unless we're a server user with nothing configured yet.
	const showSearch = $derived($searchConfig.editable || $searchConfig.available);
	const canOverride = $derived(
		$searchConfig.editable && $searchConfig.source === 'user' && !!$searchConfig.adminUrl
	);

	function restoreServerDefault() {
		$settingsStore.searchUrl = '';
	}

	// System-instruction editor: one prompt shown at a time. The textarea reflects the
	// override if set, else the built-in default; editing stores an override (cleared
	// again if it's blanked or matches the default).
	let selectedPrompt = $state<PromptKey>('currentDate');
	const selectedOverride = $derived($settingsStore.promptOverrides?.[selectedPrompt]);
	const selectedText = $derived(selectedOverride ?? DEFAULT_PROMPTS[selectedPrompt].default);

	function setOverride(key: PromptKey, value: string) {
		const next = { ...$settingsStore.promptOverrides };
		if (!value.trim() || value === DEFAULT_PROMPTS[key].default) delete next[key];
		else next[key] = value;
		$settingsStore.promptOverrides = next;
	}

	function resetOverride(key: PromptKey) {
		const next = { ...$settingsStore.promptOverrides };
		delete next[key];
		$settingsStore.promptOverrides = next;
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
				<span class="text-xs text-muted">
					{$webFetchConfig.available
						? $LL.webFetchLockedOn({ pages: $webFetchConfig.maxPages })
						: $LL.webFetchLockedOff()}
				</span>
			</div>
		{/if}
		<SettingsHint>{$LL.webFetchHint()}</SettingsHint>
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

	<SettingsSection title={$LL.currentDateTitle()} description={$LL.currentDateDescription()} card>
		<FieldCheckbox label={$LL.currentDateToggle()} bind:checked={$settingsStore.sendCurrentDate} />
	</SettingsSection>

	<SettingsSection
		title={$LL.systemInstructionsTitle()}
		description={$LL.systemInstructionsDescription({ app: APP_NAME })}
		card
	>
		<Select
			value={selectedPrompt}
			options={PROMPT_KEYS.map((key) => ({ value: key, label: DEFAULT_PROMPTS[key].label }))}
			onChange={(option) => (selectedPrompt = option.value as PromptKey)}
		/>

		<p class="text-xs text-muted">{DEFAULT_PROMPTS[selectedPrompt].hint}</p>

		<textarea
			class="settings-field min-h-36 resize-y font-mono text-xs leading-relaxed"
			value={selectedText}
			oninput={(e) => setOverride(selectedPrompt, e.currentTarget.value)}
		></textarea>

		<div class="flex items-center justify-between gap-2">
			<span class="text-xs text-muted">
				{#if DEFAULT_PROMPTS[selectedPrompt].placeholders}
					{$LL.placeholders()}: {DEFAULT_PROMPTS[selectedPrompt].placeholders?.join(', ')}
				{/if}
			</span>
			{#if selectedOverride !== undefined}
				<SettingsLink align="end" onclick={() => resetOverride(selectedPrompt)}>
					{$LL.resetToDefault()}
				</SettingsLink>
			{/if}
		</div>
	</SettingsSection>
</SettingsPanel>
