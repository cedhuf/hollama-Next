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
	import SpeechVoice from './SpeechVoice.svelte';

	/**
	 * Everything about talking to it and being talked back to.
	 *
	 * Its own tab rather than a corner of Chat, and the reason is arithmetic rather
	 * than taste. Two models, each with a switch, and a voice by name; the language,
	 * the speed and the per-provider parameters still to come; and the loop's own
	 * behaviour underneath. That is a page, and it was already the longest thing in
	 * a tab about sampling and system prompts.
	 *
	 * `Voice` rather than `Speech`, deliberately. It covers both directions in one
	 * ordinary word, and `speech` is already spoken for: it is the model kind that
	 * means synthesis specifically, so a tab of that name holding transcription
	 * would make the same word mean two things one screen apart.
	 */
	const voiceCfg = $derived($chatDefaultsConfig.voice);
</script>

<SettingsPanel>
	<!-- Dictation. Not tied to the phone, though that is where it was built for: a
	     microphone in the composer is worth having on a desktop too.

	     Locked, it shows what the instance publishes and offers nothing to change:
	     on most instances the administrator is the only person who could have set a
	     transcription model up at all. -->
	<SettingsSection title={$LL.voiceInput()} description={$LL.voiceInputHelp()} card>
		{#if voiceCfg.editable}
			<FieldCheckbox label={$LL.voiceInput()} bind:checked={$settingsStore.voiceInput}>
				{#snippet badge()}
					<SettingsBadge>{$LL.alpha()}</SettingsBadge>
				{/snippet}
			</FieldCheckbox>

			{#if $settingsStore.voiceInput}
				<!-- Transcription models only. The picker reads the kind from the
				     catalogue, which takes the provider's word where it gives one and
				     guesses from the name otherwise, and lets an administrator correct it
				     in Models and prices. An empty list is the honest answer here: it
				     means this account can reach no model that transcribes. -->
				<SettingsField label={$LL.voiceModel()}>
					<ModelSelect
						kinds={['audio']}
						value={$settingsStore.voiceModel ?? undefined}
						onSelect={(name) => ($settingsStore.voiceModel = name || null)}
					/>
				</SettingsField>
				<SettingsHint>{$LL.voiceModelHelp()}</SettingsHint>

				<!-- Dictation only. Reading aloud has nowhere to put a language: on
				     Kokoro, Aura and Voxtral it is part of the voice's own name, and on
				     Gemini and Grok the voices are timbres, the model reads the language
				     off the text, and the unified route exposes no way to override it. -->
				<SettingsField label={$LL.voiceLanguage()}>
					<input
						class="settings-field"
						type="text"
						maxlength="2"
						autocomplete="off"
						spellcheck="false"
						placeholder={$LL.voiceLanguageAuto()}
						bind:value={$settingsStore.voiceLanguage}
					/>
				</SettingsField>
				<SettingsHint>{$LL.voiceLanguageHelp()}</SettingsHint>
			{/if}
		{:else}
			<SettingsField label={$LL.voiceInput()}>
				{#snippet badge()}
					<SettingsBadge>{$LL.setByAdmin()}</SettingsBadge>
				{/snippet}
				<input
					class="settings-field"
					disabled
					value={voiceCfg.voiceInput ? voiceCfg.voiceModel || $LL.none() : $LL.off()}
				/>
			</SettingsField>
		{/if}
	</SettingsSection>

	<!-- The other direction, and its own switch. Dictating into a field is a
	     convenience anybody might want; being read to is a mode, and on most
	     connections it is a second model again. -->
	<SettingsSection title={$LL.speechOutput()} description={$LL.speechOutputHelp()} card>
		<FieldCheckbox label={$LL.speechOutput()} bind:checked={$settingsStore.speechOutput}>
			{#snippet badge()}
				<SettingsBadge>{$LL.alpha()}</SettingsBadge>
			{/snippet}
		</FieldCheckbox>

		{#if $settingsStore.speechOutput}
			<!-- A different list from the one above, not a filter of it: Kokoro answers
			     400 to a recording and Whisper answers 400 to a sentence. -->
			<SettingsField label={$LL.speechModel()}>
				<ModelSelect
					kinds={['speech']}
					value={$settingsStore.speechModel ?? undefined}
					onSelect={(name) => {
						$settingsStore.speechModel = name || null;
						// The names belong to the model, so carrying one across would leave
						// a voice behind that the new model refuses.
						$settingsStore.speechVoice = '';
					}}
				/>
			</SettingsField>
			<SettingsHint>{$LL.speechModelHelp()}</SettingsHint>

			{#if $settingsStore.speechModel}
				<SettingsField label={$LL.speechVoice()}>
					<SpeechVoice model={$settingsStore.speechModel} />
				</SettingsField>
				<SettingsHint>{$LL.speechVoiceHelp()}</SettingsHint>
			{/if}
		{/if}
	</SettingsSection>

	<!-- The loop's own behaviour, which is neither of the two models above and does
	     not belong to either. It is also the pair of values a first real session is
	     most likely to disagree with, which is the argument for their being reachable
	     rather than compiled in. -->
	<SettingsSection title={$LL.voiceLoop()} description={$LL.voiceLoopHelp()} card>
		<SettingsField label={$LL.voiceSilence()}>
			<SettingsSlider
				label={$LL.voiceSilence()}
				bind:value={$settingsStore.voiceSilenceMs}
				min={500}
				max={4000}
				step={250}
				format={(value) => $LL.voiceSilenceValue({ seconds: String(value / 1000) })}
			/>
		</SettingsField>
		<SettingsHint>{$LL.voiceSilenceHelp()}</SettingsHint>

		<FieldCheckbox
			label={$LL.voiceAutoContinue()}
			bind:checked={$settingsStore.voiceAutoContinue}
		/>
		<SettingsHint>{$LL.voiceAutoContinueHelp()}</SettingsHint>
	</SettingsSection>
</SettingsPanel>
