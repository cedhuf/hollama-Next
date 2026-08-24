<script lang="ts">
	import LL from '$i18n/i18n-svelte';
	import { isSystemDefault, SYSTEM_SAMPLING_DEFAULTS } from '$lib/chat/options';
	import { chatDefaultsConfig } from '$lib/chatDefaults';
	import FieldCheckbox from '$lib/components/FieldCheckbox.svelte';
	import ModelSelect from '$lib/components/ModelSelect.svelte';
	import { settingsStore } from '$lib/localStorage';

	import SamplingFields from './SamplingFields.svelte';
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

	const samplingCfg = $derived($chatDefaultsConfig.sampling);
	/**
	 * Nothing to reset once the administrator has locked the values, and nothing
	 * to reset when the fields already say exactly what the app ships with. The
	 * control names its one destination rather than saying "reset", because a
	 * reset that does not say where it lands is a reset nobody dares press.
	 */
	const canResetSampling = $derived(
		samplingCfg.editable && !isSystemDefault($settingsStore.sampling)
	);

	function resetSampling() {
		$settingsStore.sampling = { ...SYSTEM_SAMPLING_DEFAULTS };
	}

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
	</SettingsSection>

	<!-- Sampling: the account's own set, which every new conversation starts from.
	     Its own section rather than a row in Defaults above: nineteen fields under
	     a heading that also holds the default model would bury the two settings
	     people actually come here for. -->
	<SettingsSection title={$LL.sampling()} description={$LL.samplingDescription()} card>
		{#snippet badge()}
			{#if !samplingCfg.editable}
				<SettingsBadge>{$LL.setByAdmin()}</SettingsBadge>
			{/if}
		{/snippet}

		<!-- Two branches rather than one, because a locked panel shows the published
		     set and must not be able to write to it: there is nothing to bind to. -->
		{#if samplingCfg.editable}
			<SamplingFields bind:values={$settingsStore.sampling} ollama={true} />
		{:else}
			<SamplingFields values={samplingCfg.value} ollama={true} disabled />
		{/if}

		{#if samplingCfg.editable}
			<div class="flex flex-col gap-1">
				<button
					type="button"
					class="text-link self-start text-xs hover:underline disabled:cursor-not-allowed disabled:opacity-50"
					disabled={!canResetSampling}
					onclick={resetSampling}
				>
					{$LL.samplingReset()}
				</button>
				<SettingsHint>{$LL.samplingResetHint()}</SettingsHint>
			</div>
		{/if}
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
