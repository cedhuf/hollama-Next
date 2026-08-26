<script lang="ts">
	import { RotateCcw } from '@lucide/svelte';

	import LL from '$i18n/i18n-svelte';
	import { isSystemDefault, SYSTEM_SAMPLING_DEFAULTS } from '$lib/chat/options';
	import { chatDefaultsConfig } from '$lib/chatDefaults';
	import FieldCheckbox from '$lib/components/FieldCheckbox.svelte';
	import ModelSelect from '$lib/components/ModelSelect.svelte';
	import NumberField from '$lib/components/NumberField.svelte';
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
	 * Nothing to clear once the administrator has locked the values, and nothing
	 * to clear when every field is already empty.
	 *
	 * The control says "clear" rather than "reset to the defaults" because that is
	 * what it does: `SYSTEM_SAMPLING_DEFAULTS` is empty on purpose, so the app has
	 * no numbers of its own to go back to, and emptying the fields is what hands
	 * each provider back to its own. A button promising defaults that do not exist
	 * is one nobody dares press.
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
		<!-- Stated as switching it off, because it is on by default on a phone now.
		     Nobody turns on the thing they were going to get anyway, and a checkbox
		     that is ticked from the start reads as a feature somebody else enabled.

		     The stored setting still means what it always did. Only the question does
		     the inverting, which keeps every account that had already chosen. -->
		<FieldCheckbox
			label={$LL.classicMobileUI()}
			checked={!$settingsStore.simplifiedMobileUI}
			onChange={(off) => ($settingsStore.simplifiedMobileUI = !off)}
		>
			{#snippet badge()}
				<SettingsBadge>{$LL.alpha()}</SettingsBadge>
			{/snippet}
		</FieldCheckbox>
		<SettingsHint>{$LL.classicMobileUIHelp()}</SettingsHint>

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

		<!-- Same control, same words and same corner as the reset on an Ollama
		     connection: both put a panel of fields back to Auto. -->
		{#snippet action()}
			{#if samplingCfg.editable}
				<button
					type="button"
					class="text-link flex shrink-0 items-center gap-1.5 text-xs hover:underline disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:no-underline"
					disabled={!canResetSampling}
					onclick={resetSampling}
				>
					<RotateCcw class="h-3.5 w-3.5" />
					{$LL.resetToAuto()}
				</button>
			{/if}
		{/snippet}

		<!-- Two branches rather than one, because a locked panel shows the published
		     set and must not be able to write to it: there is nothing to bind to. -->
		{#if samplingCfg.editable}
			<SamplingFields bind:values={$settingsStore.sampling} ollama={true} />
		{:else}
			<SamplingFields values={samplingCfg.value} ollama={true} disabled />
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
				<NumberField
					min={4000}
					step={1000}
					value={$settingsStore.compactThreshold}
					onChange={setThreshold}
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
