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

	/** The same shell as the persona editor and the settings dialog, so the three read as one family. */
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

	/** Which is what stops the app naming the conversation over the top of it: nothing else distinguished a name the model wrote from a name a person chose. */
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

	/** Read from the connection the chosen model sits on rather than from the conversation's stored model, so switching model relabels the panel straight away. */
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
		<!-- The bar is the title field: it used to print the name and then ask for it
		     again in the card below, which is one question twice. -->
		<div class="border-shade-2 flex h-12 shrink-0 items-center gap-2 border-b px-4">
			<input
				class="text-active placeholder:text-active hover:border-shade-3 focus:border-shade-3 focus:bg-shade-0 min-w-0 flex-1 rounded-md border border-transparent px-2 py-1 text-sm font-semibold outline-none"
				bind:value={session.title}
				oninput={onTitleInput}
				placeholder={resolveSessionTitle(session) || $LL.untitled()}
				aria-label={$LL.conversationTitle()}
			/>
			<button
				type="button"
				onclick={() => (open = false)}
				aria-label={$LL.close()}
				class="text-muted hover:bg-shade-2 hover:text-active shrink-0 rounded-md p-1.5 transition-colors"
			>
				<X class="h-4 w-4" />
			</button>
		</div>

		<!-- The model, then two folded rows: everything a conversation can be told, in a
		     dialog that fits without scrolling. -->
		<div class="min-h-0 flex-1 overflow-auto p-4">
			<div class="mx-auto flex w-full max-w-[60ch] flex-col gap-3">
				<SettingsField label={$LL.model()}>
					<ModelSelect bind:value={modelName} />
				</SettingsField>

				<!-- The biggest block, for the thing changed least often. Folded, its summary
				     says whether this conversation departs from the prompts in Settings. -->
				<Collapsible
					title={$LL.systemPrompt()}
					summary={isOverridden ? $LL.overridden() : $LL.fromMySettings()}
				>
					<div class="flex flex-col gap-2">
						<SettingsHint>{$LL.sessionSystemPromptHelp()}</SettingsHint>

						<textarea
							class="settings-field field-grow min-h-32"
							rows="5"
							bind:value={session.systemPrompt.content}
							oninput={onSystemPromptInput}
							placeholder={$LL.sessionSystemPromptPlaceholder()}></textarea>

						{#if isOverridden}
							<button
								type="button"
								class="text-link self-start text-xs hover:underline"
								onclick={resetSystemPromptToDefault}
							>
								{$LL.resetToSettingsDefault()}
							</button>
						{/if}
					</div>
				</Collapsible>

				<!-- One level of folding, not two: the sampling groups fold themselves, so
				     wrapping them buried the two fields anybody actually reaches for. -->
				<!-- Open on arrival, unlike the prompt above it: it is what people come to this
				     dialog for. The groups underneath stay folded. -->
				<Collapsible title={$LL.sampling()} summary={samplingSummary} open>
					<div class="flex flex-col gap-2">
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
									{$LL.resetToSettingsDefault()}
								</button>
							{/if}
						{:else}
							<!-- Locked means locked everywhere, not only in Settings: a conversation that
							     could still override would be the same policy with a hole in it. -->
							<SettingsBadge>{$LL.setByAdmin()}</SettingsBadge>
							<SamplingFields values={samplingCfg.value} ollama={isOllama} disabled />
						{/if}
					</div>
				</Collapsible>
			</div>
		</div>
	</div>
</Modal>
