<script lang="ts">
	import { Trash2 } from '@lucide/svelte';

	import LL from '$i18n/i18n-svelte';
	import { chatDefaultsConfig } from '$lib/chatDefaults';
	import FieldCheckbox from '$lib/components/FieldCheckbox.svelte';
	import ModelSelect from '$lib/components/ModelSelect.svelte';
	import Select from '$lib/components/Select.svelte';
	import { settingsStore } from '$lib/localStorage';
	import { systemPromptsConfig } from '$lib/systemPrompts';

	import SettingsBadge from './SettingsBadge.svelte';
	import SettingsField from './SettingsField.svelte';
	import SettingsHint from './SettingsHint.svelte';
	import SettingsLink from './SettingsLink.svelte';
	import SettingsPanel from './SettingsPanel.svelte';
	import SettingsSection from './SettingsSection.svelte';
	import SettingsSlider from './SettingsSlider.svelte';

	const dmEditable = $derived($chatDefaultsConfig.defaultModel.editable);
	const dmValue = $derived($chatDefaultsConfig.defaultModel.value || undefined);
	const titleCfg = $derived($chatDefaultsConfig.title);
	const titleModelValue = $derived(titleCfg.titleModel || undefined);
	const compactCfg = $derived($chatDefaultsConfig.compact);
	const compactModelValue = $derived(compactCfg.compactModel || undefined);

	/**
	 * A threshold below a few thousand tokens would compact after every other
	 * message, so the field refuses it rather than accepting a value that makes
	 * the conversation unusable.
	 */
	function setThreshold(raw: string) {
		const value = Number(raw);
		if (!Number.isFinite(value) || value < 4000) return;
		$settingsStore.compactThreshold = Math.round(value);
	}

	const spEditable = $derived($systemPromptsConfig.editable);
	const spShared = $derived($systemPromptsConfig.shared);
	const spSource = $derived($systemPromptsConfig.source);
	const sharedPrompts = $derived($systemPromptsConfig.prompts);
	const sharedPerModel = $derived(Object.entries(sharedPrompts.perModel));
	const adminPrompts = $derived($systemPromptsConfig.adminPrompts);
	const adminDefaultExists = $derived(
		!!adminPrompts.global.trim() || Object.keys(adminPrompts.perModel).length > 0
	);
	const canRestore = $derived(spEditable && spSource === 'user' && adminDefaultExists);

	function restoreServerDefault() {
		$settingsStore.systemPrompts = { global: '', perModel: {} };
	}

	const perModelEntries = $derived(Object.entries($settingsStore.systemPrompts.perModel));
	const availableToAdd = $derived(
		[...new Set($settingsStore.models.map((m) => m.name))].filter(
			(name) => !$settingsStore.systemPrompts.perModel[name]
		)
	);

	function addModelPrompt(name: string) {
		if (!name) return;
		$settingsStore.systemPrompts = {
			...$settingsStore.systemPrompts,
			perModel: {
				...$settingsStore.systemPrompts.perModel,
				[name]: { prompt: '', mode: 'extend' }
			}
		};
	}

	function removeModelPrompt(name: string) {
		const perModel = { ...$settingsStore.systemPrompts.perModel };
		delete perModel[name];
		$settingsStore.systemPrompts = { ...$settingsStore.systemPrompts, perModel };
	}
</script>

<SettingsPanel>
	<SettingsSection title={$LL.defaults()} card>
		{#if dmEditable}
			<SettingsField label={$LL.defaultModel()}>
				<ModelSelect
					value={dmValue}
					onSelect={(name) => ($settingsStore.defaultModel = name || null)}
				/>
			</SettingsField>
		{:else}
			<SettingsField label={$LL.defaultModel()}>
				{#snippet badge()}
					<SettingsBadge>{$LL.setByAdmin()}</SettingsBadge>
				{/snippet}
				<input class="settings-field" disabled value={dmValue ?? '—'} />
			</SettingsField>
		{/if}

		{#if titleCfg.editable}
			<FieldCheckbox
				label={$LL.generateTitlesWithAI()}
				bind:checked={$settingsStore.generateTitlesWithAI}
			/>
			<SettingsHint>{$LL.generateTitlesWithAIHelp()}</SettingsHint>

			{#if $settingsStore.generateTitlesWithAI}
				<SettingsField label={$LL.titleModel()}>
					<ModelSelect
						value={titleModelValue}
						onSelect={(name) => ($settingsStore.titleModel = name || null)}
					/>
				</SettingsField>

				<!-- The first title is written before anything has been answered, so it
				     names the question rather than the conversation. Once, and never over
				     a name you typed yourself. -->
				<FieldCheckbox
					label={$LL.regenerateTitle()}
					bind:checked={$settingsStore.regenerateTitle}
				/>
				<SettingsHint>{$LL.regenerateTitleHelp()}</SettingsHint>

				{#if $settingsStore.regenerateTitle}
					<SettingsSlider
						label={$LL.regenerateTitleAfter()}
						bind:value={$settingsStore.regenerateTitleAfter}
						min={2}
						max={10}
						format={(value) => $LL.regenerateTitleAfterValue({ count: value })}
					/>
				{/if}
			{/if}
		{:else}
			<SettingsField label={$LL.generateTitlesWithAI()}>
				{#snippet badge()}
					<SettingsBadge>{$LL.setByAdmin()}</SettingsBadge>
				{/snippet}
				<input
					class="settings-field"
					disabled
					value={titleCfg.generateTitlesWithAI
						? `${$LL.on()} — ${titleCfg.titleModel || '—'}`
						: $LL.off()}
				/>
			</SettingsField>
		{/if}
		<FieldCheckbox
			label={$LL.autoExpandReasoningBlocks()}
			bind:checked={$settingsStore.autoExpandReasoningBlocks}
		/>
		<SettingsHint>{$LL.autoExpandReasoningBlocksHelp()}</SettingsHint>

		<FieldCheckbox
			label={$LL.serverSideGeneration()}
			bind:checked={$settingsStore.serverSideGeneration}
		/>
		<SettingsHint>{$LL.serverSideGenerationHelp()}</SettingsHint>
	</SettingsSection>

	<SettingsSection title={$LL.compaction()} description={$LL.compactionDescription()} card>
		{#snippet badge()}
			{#if !compactCfg.editable}
				<SettingsBadge>{$LL.setByAdmin()}</SettingsBadge>
			{/if}
		{/snippet}

		{#if compactCfg.editable}
			<SettingsField label={$LL.compactModel()}>
				<ModelSelect
					value={compactModelValue}
					onSelect={(name) => ($settingsStore.compactModel = name || null)}
				/>
			</SettingsField>
			<SettingsHint>{$LL.compactModelHelp()}</SettingsHint>

			<FieldCheckbox label={$LL.autoCompact()} bind:checked={$settingsStore.autoCompact} />
			<SettingsHint>{$LL.autoCompactHelp()}</SettingsHint>

			<SettingsField label={$LL.compactThreshold()}>
				<input
					class="settings-field"
					type="number"
					min="4000"
					step="1000"
					value={$settingsStore.compactThreshold}
					onchange={(event) => setThreshold(event.currentTarget.value)}
				/>
			</SettingsField>
			<SettingsHint>{$LL.compactThresholdHelp()}</SettingsHint>
		{:else}
			<SettingsField label={$LL.compactModel()}>
				<input class="settings-field" disabled value={compactCfg.compactModel || '—'} />
			</SettingsField>
			<SettingsField label={$LL.autoCompact()}>
				<input
					class="settings-field"
					disabled
					value={compactCfg.autoCompact
						? `${$LL.on()} — ${compactCfg.compactThreshold.toLocaleString()}`
						: $LL.off()}
				/>
			</SettingsField>
		{/if}
	</SettingsSection>

	<SettingsSection title={$LL.systemPromptsTitle()} description={$LL.systemPromptsDescription()}>
		{#snippet badge()}
			{#if spShared && !spEditable}
				<SettingsBadge>{$LL.sharedByAdminBadge()}</SettingsBadge>
			{:else if spShared}
				<SettingsBadge>{$LL.serverDefaultBadge()}</SettingsBadge>
			{/if}
		{/snippet}

		{#if spEditable}
			{#if canRestore}
				<SettingsLink onclick={restoreServerDefault}>{$LL.restoreServerDefault()}</SettingsLink>
			{/if}

			<SettingsField label={$LL.globalPrompt()}>
				<textarea
					class="settings-field"
					rows="3"
					bind:value={$settingsStore.systemPrompts.global}
					placeholder={adminDefaultExists && adminPrompts.global
						? adminPrompts.global
						: $LL.globalPromptPlaceholder()}
				></textarea>
			</SettingsField>

			<!-- Heading and picker stacked: side by side, the model names in the picker
			     wrapped onto a second line as soon as they got long. -->
			<div class="mt-2 flex flex-col gap-1.5">
				<span class="text-sm font-medium">{$LL.perModelPrompts()}</span>
				{#if availableToAdd.length}
					<Select
						value=""
						searchable
						emptyLabel={$LL.addAModel()}
						options={availableToAdd.map((name) => ({ value: name, label: name }))}
						onChange={(option) => option.value && addModelPrompt(option.value)}
					/>
				{/if}
			</div>

			{#if perModelEntries.length}
				<div class="flex flex-col gap-2">
					{#each perModelEntries as [name] (name)}
						<div class="flex flex-col gap-2 rounded-md border border-shade-3 p-2.5">
							<div class="flex items-center justify-between gap-2">
								<span class="min-w-0 truncate text-sm font-medium" title={name}>{name}</span>
								<button
									type="button"
									class="text-muted transition-colors hover:text-active"
									onclick={() => removeModelPrompt(name)}
									aria-label={$LL.removeModelPrompt({ model: name })}
								>
									<Trash2 class="base-icon" />
								</button>
							</div>
							<textarea
								class="settings-field"
								rows="2"
								bind:value={$settingsStore.systemPrompts.perModel[name].prompt}
								placeholder={$LL.promptForModel({ model: name })}
							></textarea>
							<Select
								bind:value={$settingsStore.systemPrompts.perModel[name].mode}
								options={[
									{ value: 'extend', label: $LL.extendsGlobalPrompt() },
									{ value: 'replace', label: $LL.replacesGlobalPrompt() }
								]}
							/>
						</div>
					{/each}
				</div>
			{:else}
				<SettingsHint>{$LL.noPerModelPrompts()}</SettingsHint>
			{/if}
		{:else}
			<SettingsField label={$LL.globalPrompt()}>
				<textarea class="settings-field" rows="3" disabled value={sharedPrompts.global}></textarea>
			</SettingsField>

			{#if sharedPerModel.length}
				<div class="flex flex-col gap-2">
					{#each sharedPerModel as [name, mp] (name)}
						<div class="flex flex-col gap-1 rounded-md border border-shade-3 p-2.5">
							<span class="text-sm font-medium">
								{name}
								<span class="text-xs text-muted">
									({mp.mode === 'replace' ? $LL.replacesGlobalShort() : $LL.extendsGlobalShort()})
								</span>
							</span>
							<textarea class="settings-field" rows="2" disabled value={mp.prompt}></textarea>
						</div>
					{/each}
				</div>
			{/if}
		{/if}
	</SettingsSection>
</SettingsPanel>
