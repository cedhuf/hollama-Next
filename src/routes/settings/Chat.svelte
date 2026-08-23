<script lang="ts">
	import LL from '$i18n/i18n-svelte';
	import { chatDefaultsConfig } from '$lib/chatDefaults';
	import FieldCheckbox from '$lib/components/FieldCheckbox.svelte';
	import ModelSelect from '$lib/components/ModelSelect.svelte';
	import { settingsStore } from '$lib/localStorage';

	import SettingsBadge from './SettingsBadge.svelte';
	import SettingsField from './SettingsField.svelte';
	import SettingsHint from './SettingsHint.svelte';
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
				<input class="settings-field" disabled value={dmValue ?? $LL.none()} />
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
						? `${$LL.on()}: ${titleCfg.titleModel || $LL.none()}`
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
				<input class="settings-field" disabled value={compactCfg.compactModel || $LL.none()} />
			</SettingsField>
			<SettingsField label={$LL.autoCompact()}>
				<input
					class="settings-field"
					disabled
					value={compactCfg.autoCompact
						? `${$LL.on()}: ${compactCfg.compactThreshold.toLocaleString()}`
						: $LL.off()}
				/>
			</SettingsField>
		{/if}
	</SettingsSection>
</SettingsPanel>
