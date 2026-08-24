<script lang="ts">
	import { X } from '@lucide/svelte';

	import LL from '$i18n/i18n-svelte';
	import { chatDefaultsConfig } from '$lib/chatDefaults';
	import Collapsible from '$lib/components/Collapsible.svelte';
	import Modal from '$lib/components/Modal.svelte';
	import ModelSelect from '$lib/components/ModelSelect.svelte';
	import { ConnectionType } from '$lib/connections';
	import { serversStore, settingsStore } from '$lib/localStorage';
	import { resolveSessionTitle, saveSession, type Session } from '$lib/sessions';
	import { effectiveSystemPrompt, systemPromptsConfig } from '$lib/systemPrompts';

	import SamplingFields from '../../settings/SamplingFields.svelte';
	import SettingsBadge from '../../settings/SettingsBadge.svelte';
	import SettingsField from '../../settings/SettingsField.svelte';
	import SettingsHint from '../../settings/SettingsHint.svelte';
	import SettingsSection from '../../settings/SettingsSection.svelte';

	/**
	 * Per-conversation settings. Same shell as the persona editor and the settings
	 * dialog (title bar with a close button, then a scrollable body of
	 * `SettingsSection`s) so the three read as one family.
	 */
	interface Props {
		open: boolean;
		session: Session;
		modelName: string | undefined;
	}

	let { open = $bindable(false), session = $bindable(), modelName = $bindable() }: Props = $props();

	const resolvedDefault = $derived(effectiveSystemPrompt(modelName, $systemPromptsConfig.prompts));
	const isOverridden = $derived(
		!!session.systemPromptEdited && resolvedDefault !== session.systemPrompt.content
	);

	/**
	 * A title typed here is yours, and is marked as such.
	 *
	 * Which is what stops the app naming the conversation again over the top of it.
	 * Nothing else distinguished a name the model wrote from a name a person chose.
	 */
	function onTitleInput() {
		session.titleEdited = true;
		saveSession(session);
	}

	function onSystemPromptInput() {
		session.systemPromptEdited = true;
		saveSession(session);
	}

	function resetSystemPromptToDefault() {
		session.systemPrompt = { ...session.systemPrompt, content: resolvedDefault };
		session.systemPromptEdited = false;
		saveSession(session);
	}

	// --- sampling --------------------------------------------------------------

	const samplingCfg = $derived($chatDefaultsConfig.sampling);
	const overrideCount = $derived(Object.keys(session.options ?? {}).length);

	/**
	 * Whether the second group of fields will actually reach anything.
	 *
	 * Read from the connection the chosen model sits on rather than from the
	 * conversation's stored model, so switching model in the picker above relabels
	 * the panel straight away instead of at the next reload.
	 */
	const isOllama = $derived.by(() => {
		const serverId =
			$settingsStore.models?.find((model) => model.name === modelName)?.serverId ??
			session.model?.serverId;
		return (
			$serversStore.find((server) => server.id === serverId)?.connectionType ===
			ConnectionType.Ollama
		);
	});

	/** Folded shut, it still says whether this conversation disagrees with anything. */
	const samplingSummary = $derived(
		overrideCount ? $LL.samplingFieldCount({ count: overrideCount }) : $LL.samplingNothingSet()
	);

	function onSamplingChange() {
		saveSession(session);
	}

	function clearSampling() {
		session.options = {};
		saveSession(session);
	}
</script>

<Modal bind:open closeButton={false}>
	<div class="flex h-full w-full flex-col">
		<!-- Header: live title + close, aligned with the persona and settings modals -->
		<div class="border-shade-2 flex h-12 shrink-0 items-center justify-between gap-2 border-b px-4">
			<span class="text-active truncate text-sm font-semibold">
				{session.title?.trim() || resolveSessionTitle(session) || 'Conversation settings'}
			</span>
			<button
				type="button"
				onclick={() => (open = false)}
				aria-label="Close"
				class="text-muted hover:bg-shade-2 hover:text-active rounded-md p-1.5 transition-colors"
			>
				<X class="h-4 w-4" />
			</button>
		</div>

		<!-- Body -->
		<div class="min-h-0 flex-1 overflow-auto p-4">
			<div class="mx-auto flex w-full max-w-[60ch] flex-col gap-6">
				<SettingsSection title="Conversation" card>
					<SettingsField label="Title">
						<input
							class="settings-field"
							bind:value={session.title}
							oninput={onTitleInput}
							placeholder={resolveSessionTitle(session) || 'Untitled'}
						/>
					</SettingsField>

					<SettingsField label="Model">
						<ModelSelect bind:value={modelName} />
					</SettingsField>
				</SettingsSection>

				<SettingsSection
					title="System prompt"
					description="Specific to this conversation. Pre-filled from your global / per-model prompts; edit to override just here."
					card
				>
					{#snippet badge()}
						{#if isOverridden}
							<SettingsBadge>overridden</SettingsBadge>
						{/if}
					{/snippet}

					<textarea
						class="settings-field field-grow min-h-40"
						rows="7"
						bind:value={session.systemPrompt.content}
						oninput={onSystemPromptInput}
						placeholder="Instructions for this conversation only…"></textarea>

					{#if isOverridden}
						<button
							type="button"
							class="text-link self-start text-xs hover:underline"
							onclick={resetSystemPromptToDefault}
						>
							Reset to settings default
						</button>
					{/if}
				</SettingsSection>

				<!-- Folded, because a dozen numeric fields would swamp the three things
				     people open this dialog for. The summary on the closed row is what
				     makes that safe: it already says whether this conversation departs
				     from the settings, so opening it is a decision rather than a search. -->
				<Collapsible title={$LL.sampling()} summary={samplingSummary}>
					<SettingsHint>{$LL.samplingSessionDescription()}</SettingsHint>

					{#if samplingCfg.editable}
						<SamplingFields
							bind:values={session.options}
							inherited={samplingCfg.value}
							ollama={isOllama}
							onChange={onSamplingChange}
						/>

						{#if overrideCount}
							<button
								type="button"
								class="text-link self-start text-xs hover:underline"
								onclick={clearSampling}
							>
								{$LL.samplingSessionReset()}
							</button>
						{/if}
					{:else}
						<!-- Locked means locked everywhere, not only in Settings: a
						     conversation that could still override would be the same policy
						     with a hole in it. -->
						<SettingsBadge>{$LL.setByAdmin()}</SettingsBadge>
						<SamplingFields values={samplingCfg.value} ollama={isOllama} disabled />
					{/if}
				</Collapsible>
			</div>
		</div>
	</div>
</Modal>
