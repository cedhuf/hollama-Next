<script lang="ts">
	import { Trash2 } from '@lucide/svelte';

	import LL from '$i18n/i18n-svelte';
	import { appPromptsConfig } from '$lib/appPrompts';
	import { APP_NAME } from '$lib/brand';
	import Collapsible from '$lib/components/Collapsible.svelte';
	import Select from '$lib/components/Select.svelte';
	import { DEFAULT_PROMPTS, PROMPT_GROUPS, PROMPT_KEYS, type PromptKey } from '$lib/defaultPrompts';
	import { settingsStore } from '$lib/localStorage';
	import { systemPromptsConfig } from '$lib/systemPrompts';

	import SettingsBadge from './SettingsBadge.svelte';
	import SettingsField from './SettingsField.svelte';
	import SettingsHint from './SettingsHint.svelte';
	import SettingsLink from './SettingsLink.svelte';
	import SettingsPanel from './SettingsPanel.svelte';
	import SettingsSection from './SettingsSection.svelte';

	/**
	 * Everything anybody says to a model before the conversation starts.
	 *
	 * Two kinds, and they were in two places: the system prompt among the model
	 * defaults, and the app's own instructions behind a dropdown that showed one of
	 * twenty and advertised none. Neither was where somebody looking for "what is
	 * being said on my behalf" would think to look.
	 *
	 * Deliberately not here: a persona's prompt and a playbook's instructions, which
	 * belong to a thing you wrote and stay with it in the library.
	 *
	 * Everyone sees the whole screen, including where the instance forbids changing
	 * it: a read-only field says what is being sent for you, where a hidden one only
	 * says that something is.
	 */

	// --- The system prompt ----------------------------------------------------
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

	// --- The app's own instructions --------------------------------------------
	const editable = $derived($appPromptsConfig.editable);
	const shared = $derived($appPromptsConfig.shared);
	/** What is actually sent: the admin's, yours, or the two merged per prompt. */
	const inForce = $derived($appPromptsConfig.overrides);
	const fromAdmin = $derived($appPromptsConfig.adminOverrides);
	/** Yours alone, which is the only part a reset is entitled to remove. */
	const mine = $derived($settingsStore.promptOverrides ?? {});
	const rewritten = $derived(PROMPT_KEYS.filter((key) => inForce[key] !== undefined));

	function textOf(key: PromptKey): string {
		return inForce[key] ?? DEFAULT_PROMPTS[key].default;
	}

	/** Who wrote what is on screen, said while the prompt is still folded. */
	function summaryFor(key: PromptKey): string | undefined {
		if (mine[key] !== undefined) return $LL.promptEdited();
		if (inForce[key] !== undefined) return $LL.promptFromAdmin();
		return undefined;
	}

	function setOverride(key: PromptKey, value: string) {
		const next = { ...$settingsStore.promptOverrides };
		// Blanking a prompt means "give me the wording back", not "send nothing": an
		// empty instruction quietly removes a behaviour the rest of the app assumes.
		const baseline = fromAdmin[key] ?? DEFAULT_PROMPTS[key].default;
		if (!value.trim() || value === baseline) delete next[key];
		else next[key] = value;
		$settingsStore.promptOverrides = next;
	}

	function resetOverride(key: PromptKey) {
		const next = { ...$settingsStore.promptOverrides };
		delete next[key];
		$settingsStore.promptOverrides = next;
	}

	function resetAll() {
		$settingsStore.promptOverrides = {};
	}
</script>

<SettingsPanel>
	<SettingsSection
		title={$LL.promptsTitle({ app: APP_NAME })}
		description={$LL.promptsDescription({ app: APP_NAME })}
		card
	>
		<SettingsHint>{$LL.promptsElsewhere()}</SettingsHint>
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
						: $LL.globalPromptPlaceholder()}></textarea>
			</SettingsField>

			<!-- Heading and picker stacked: side by side, the model names wrapped onto a
			     second line as soon as they got long. -->
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
						<div class="border-shade-3 flex flex-col gap-2 rounded-md border p-2.5">
							<div class="flex items-center justify-between gap-2">
								<span class="min-w-0 truncate text-sm font-medium" title={name}>{name}</span>
								<button
									type="button"
									class="text-muted hover:text-active transition-colors"
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
								placeholder={$LL.promptForModel({ model: name })}></textarea>
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
						<div class="border-shade-3 flex flex-col gap-1 rounded-md border p-2.5">
							<span class="text-sm font-medium">
								{name}
								<span class="text-muted text-xs">
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

	<SettingsSection title={$LL.appPromptsTitle()} description={$LL.appPromptsDescription()}>
		{#snippet badge()}
			{#if shared && !editable}
				<SettingsBadge>{$LL.sharedByAdminBadge()}</SettingsBadge>
			{:else if shared}
				<SettingsBadge>{$LL.serverDefaultBadge()}</SettingsBadge>
			{/if}
		{/snippet}

		{#if !editable}
			<SettingsHint>{$LL.appPromptsLocked()}</SettingsHint>
		{:else if rewritten.length}
			<div class="flex items-center justify-between gap-2">
				<span class="text-muted text-xs">{$LL.promptsModified({ count: rewritten.length })}</span>
				{#if Object.keys(mine).length}
					<SettingsLink align="end" onclick={resetAll}>{$LL.promptsResetAll()}</SettingsLink>
				{/if}
			</div>
		{/if}
	</SettingsSection>

	{#each PROMPT_GROUPS as group (group.id)}
		<SettingsSection title={group.label} description={group.hint}>
			{#each group.keys as key (key)}
				{@const def = DEFAULT_PROMPTS[key]}
				<Collapsible title={def.label} description={def.hint} summary={summaryFor(key)}>
					<p class="text-muted text-xs leading-snug">{def.hint}</p>

					<textarea
						class="settings-field field-grow min-h-36 font-mono text-xs leading-relaxed"
						value={textOf(key)}
						disabled={!editable}
						oninput={(e) => setOverride(key, e.currentTarget.value)}></textarea>

					<div class="flex items-center justify-between gap-2">
						<span class="text-muted text-xs">
							{#if def.placeholders}
								{$LL.placeholders()}: {def.placeholders.join(', ')}
							{/if}
						</span>
						{#if editable && mine[key] !== undefined}
							<SettingsLink align="end" onclick={() => resetOverride(key)}>
								{fromAdmin[key] !== undefined ? $LL.restoreServerDefault() : $LL.resetToDefault()}
							</SettingsLink>
						{/if}
					</div>
				</Collapsible>
			{/each}
		</SettingsSection>
	{/each}
</SettingsPanel>
