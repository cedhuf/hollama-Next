<script lang="ts">
	import { X } from '@lucide/svelte';

	import Modal from '$lib/components/Modal.svelte';
	import ModelSelect from '$lib/components/ModelSelect.svelte';
	import { resolveSessionTitle, saveSession, type Session } from '$lib/sessions';
	import { effectiveSystemPrompt, systemPromptsConfig } from '$lib/systemPrompts';

	import SettingsBadge from '../../settings/SettingsBadge.svelte';
	import SettingsField from '../../settings/SettingsField.svelte';
	import SettingsSection from '../../settings/SettingsSection.svelte';

	/**
	 * Per-conversation settings. Same shell as the persona editor and the settings
	 * dialog — title bar with a close button, then a scrollable body of
	 * `SettingsSection`s — so the three read as one family.
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
</script>

<Modal bind:open closeButton={false}>
	<div class="flex h-full w-full flex-col">
		<!-- Header: live title + close, aligned with the persona and settings modals -->
		<div class="flex h-12 shrink-0 items-center justify-between gap-2 border-b border-shade-2 px-4">
			<span class="truncate text-sm font-semibold text-active">
				{session.title?.trim() || resolveSessionTitle(session) || 'Conversation settings'}
			</span>
			<button
				type="button"
				onclick={() => (open = false)}
				aria-label="Close"
				class="rounded-md p-1.5 text-muted transition-colors hover:bg-shade-2 hover:text-active"
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
						placeholder="Instructions for this conversation only…"
					></textarea>

					{#if isOverridden}
						<button
							type="button"
							class="self-start text-xs text-link hover:underline"
							onclick={resetSystemPromptToDefault}
						>
							Reset to settings default
						</button>
					{/if}
				</SettingsSection>
			</div>
		</div>
	</div>
</Modal>
