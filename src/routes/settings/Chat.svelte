<script lang="ts">
	import { Trash2 } from '@lucide/svelte';

	import LL from '$i18n/i18n-svelte';
	import { chatDefaultsConfig } from '$lib/chatDefaults';
	import FieldCheckbox from '$lib/components/FieldCheckbox.svelte';
	import FieldHelp from '$lib/components/FieldHelp.svelte';
	import FieldSelectModel from '$lib/components/FieldSelectModel.svelte';
	import P from '$lib/components/P.svelte';
	import Select from '$lib/components/Select.svelte';
	import { settingsStore } from '$lib/localStorage';
	import { systemPromptsConfig } from '$lib/systemPrompts';

	import SettingsField from './SettingsField.svelte';
	import SettingsPanel from './SettingsPanel.svelte';
	import SettingsSection from './SettingsSection.svelte';

	const dmEditable = $derived($chatDefaultsConfig.defaultModel.editable);
	const dmValue = $derived($chatDefaultsConfig.defaultModel.value || undefined);
	const titleCfg = $derived($chatDefaultsConfig.title);
	const titleModelValue = $derived(titleCfg.titleModel || undefined);

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
	<SettingsSection title="Defaults">
		{#if dmEditable}
			<FieldSelectModel
				isLabelVisible={true}
				label={$LL.defaultModel()}
				value={dmValue}
				onChange={(o) => ($settingsStore.defaultModel = o.value || null)}
			/>
		{:else}
			<SettingsField label={$LL.defaultModel()}>
				{#snippet badge()}
					<span class="rounded bg-shade-2 px-1.5 py-0.5 text-[11px] text-muted">set by admin</span>
				{/snippet}
				<input class="settings-field" disabled value={dmValue ?? '—'} />
			</SettingsField>
		{/if}

		{#if titleCfg.editable}
			<FieldCheckbox
				label={$LL.generateTitlesWithAI()}
				bind:checked={$settingsStore.generateTitlesWithAI}
			/>
			<FieldHelp>
				<P>{$LL.generateTitlesWithAIHelp()}</P>
			</FieldHelp>

			{#if $settingsStore.generateTitlesWithAI}
				<FieldSelectModel
					isLabelVisible={true}
					label={$LL.titleModel()}
					value={titleModelValue}
					onChange={(o) => ($settingsStore.titleModel = o.value || null)}
				/>
			{/if}
		{:else}
			<SettingsField label={$LL.generateTitlesWithAI()}>
				{#snippet badge()}
					<span class="rounded bg-shade-2 px-1.5 py-0.5 text-[11px] text-muted">set by admin</span>
				{/snippet}
				<input
					class="settings-field"
					disabled
					value={titleCfg.generateTitlesWithAI ? `On — ${titleCfg.titleModel || '—'}` : 'Off'}
				/>
			</SettingsField>
		{/if}
		<FieldCheckbox
			label={$LL.autoExpandReasoningBlocks()}
			bind:checked={$settingsStore.autoExpandReasoningBlocks}
		/>
		<FieldHelp>
			<P>{$LL.autoExpandReasoningBlocksHelp()}</P>
		</FieldHelp>
	</SettingsSection>

	<SettingsSection
		title="System prompts"
		description="Applied to every new chat (lowest priority). A per-model prompt or a per-chat prompt overrides it."
	>
		{#snippet badge()}
			{#if spShared && !spEditable}
				<span class="rounded bg-shade-2 px-1.5 py-0.5 text-[11px] text-muted">shared by admin</span>
			{:else if spShared}
				<span class="rounded bg-shade-2 px-1.5 py-0.5 text-[11px] text-muted">server default</span>
			{/if}
		{/snippet}

		{#if spEditable}
			{#if canRestore}
				<button
					type="button"
					onclick={restoreServerDefault}
					class="w-fit text-xs text-link hover:underline"
				>
					Restore server default
				</button>
			{/if}

			<SettingsField label="Global prompt">
				<textarea
					class="settings-field"
					rows="3"
					bind:value={$settingsStore.systemPrompts.global}
					placeholder={adminDefaultExists && adminPrompts.global
						? adminPrompts.global
						: "e.g. You are concise and answer in the user's language…"}
				></textarea>
			</SettingsField>

			<div class="mt-2 flex items-center justify-between gap-2">
				<span class="text-sm font-medium">Per-model prompts</span>
				{#if availableToAdd.length}
					<Select
						class="w-auto"
						value=""
						emptyLabel="+ Add a model"
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
								<span class="text-sm font-medium">{name}</span>
								<button
									type="button"
									class="text-muted transition-colors hover:text-active"
									onclick={() => removeModelPrompt(name)}
									aria-label="Remove {name} prompt"
								>
									<Trash2 class="base-icon" />
								</button>
							</div>
							<textarea
								class="settings-field"
								rows="2"
								bind:value={$settingsStore.systemPrompts.perModel[name].prompt}
								placeholder="Prompt for {name}…"
							></textarea>
							<Select
								class="w-auto text-xs"
								bind:value={$settingsStore.systemPrompts.perModel[name].mode}
								options={[
									{ value: 'extend', label: 'Extends the global prompt' },
									{ value: 'replace', label: 'Replaces the global prompt' }
								]}
							/>
						</div>
					{/each}
				</div>
			{:else}
				<FieldHelp>
					<P>No per-model prompts yet. Add one to tailor instructions for a specific model.</P>
				</FieldHelp>
			{/if}
		{:else}
			<SettingsField label="Global prompt">
				<textarea class="settings-field" rows="3" disabled value={sharedPrompts.global}></textarea>
			</SettingsField>

			{#if sharedPerModel.length}
				<div class="flex flex-col gap-2">
					{#each sharedPerModel as [name, mp] (name)}
						<div class="flex flex-col gap-1 rounded-md border border-shade-3 p-2.5">
							<span class="text-sm font-medium">
								{name}
								<span class="text-xs text-muted">
									({mp.mode === 'replace' ? 'replaces global' : 'extends global'})
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
