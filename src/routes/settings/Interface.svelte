<script lang="ts">
	import LL, { setLocale } from '$i18n/i18n-svelte';
	import type { Locales } from '$i18n/i18n-types';
	import { loadLocale } from '$i18n/i18n-util.sync';
	import FieldCheckbox from '$lib/components/FieldCheckbox.svelte';
	import Select from '$lib/components/Select.svelte';
	import ThemePicker from '$lib/components/ThemePicker.svelte';
	import { languageOptions } from '$lib/i18n';
	import { settingsStore } from '$lib/localStorage';

	import SettingsField from './SettingsField.svelte';
	import SettingsHint from './SettingsHint.svelte';
	import SettingsPanel from './SettingsPanel.svelte';
	import SettingsSection from './SettingsSection.svelte';
	import SettingsSlider from './SettingsSlider.svelte';
	import Shortcuts from './Shortcuts.svelte';

	let langValue: string = $derived($settingsStore.userLanguage ?? 'en');

	function changeLanguage({ value }: { value: string; label: string }) {
		const locale = value as Locales;
		loadLocale(locale);
		setLocale(locale);
		$settingsStore.userLanguage = locale;
	}
</script>

<SettingsPanel>
	<SettingsSection title={$LL.appearance()} card>
		<SettingsField label={$LL.language()}>
			<Select
				id="language"
				name="language"
				bind:value={langValue}
				onChange={changeLanguage}
				options={languageOptions}
			/>
		</SettingsField>

		<ThemePicker />

		<SettingsField label={$LL.surfaceTransparency()}>
			<SettingsSlider
				label={$LL.surfaceTransparency()}
				bind:value={$settingsStore.surfaceTransparencyLevel}
				min={0}
				max={100}
				step={10}
				format={(value) => `${value}%`}
			/>
		</SettingsField>
		<SettingsHint>{$LL.surfaceTransparencyHelp()}</SettingsHint>
	</SettingsSection>

	<SettingsSection title={$LL.homeScreen()} card>
		<FieldCheckbox label={$LL.showGreetingHeader()} bind:checked={$settingsStore.homeShowHeader} />
		<FieldCheckbox
			label={$LL.showPromptSuggestions()}
			bind:checked={$settingsStore.homeShowSuggestions}
		/>

		<FieldCheckbox
			label={$LL.showRecentPersonas()}
			bind:checked={$settingsStore.homeShowRecentPersonas}
		/>
		{#if $settingsStore.homeShowRecentPersonas}
			<SettingsSlider
				label={$LL.howManyToShow()}
				bind:value={$settingsStore.homeRecentPersonasCount}
			/>
		{/if}

		<FieldCheckbox
			label={$LL.showRecentSessions()}
			bind:checked={$settingsStore.homeShowRecentSessions}
		/>
		{#if $settingsStore.homeShowRecentSessions}
			<SettingsSlider
				label={$LL.howManyToShow()}
				bind:value={$settingsStore.homeRecentSessionsCount}
			/>
		{/if}
	</SettingsSection>

	<SettingsSection title={$LL.messages()} card>
		<FieldCheckbox
			label={$LL.accentUserMessages()}
			bind:checked={$settingsStore.accentUserMessages}
		/>
		<FieldCheckbox
			label={$LL.showMessageTimestamps()}
			bind:checked={$settingsStore.showMessageTimestamps}
		/>
		<FieldCheckbox
			label={$LL.fadeCompactedMessages()}
			bind:checked={$settingsStore.fadeCompactedMessages}
		/>
		<SettingsHint>{$LL.fadeCompactedMessagesHelp()}</SettingsHint>
	</SettingsSection>

	<SettingsSection title={$LL.sidebar()} card>
		<FieldCheckbox
			label={$LL.pinPersonasInSidebar()}
			bind:checked={$settingsStore.showPinnedPersonas}
		/>
		<FieldCheckbox
			label={$LL.compactSidebarHeader()}
			bind:checked={$settingsStore.compactSidebarHeader}
		/>
		<SettingsHint>{$LL.compactSidebarHeaderHelp()}</SettingsHint>
		<FieldCheckbox
			label={$LL.showListQuickActions()}
			bind:checked={$settingsStore.showListQuickActions}
		/>
		<SettingsHint>{$LL.showListQuickActionsHelp()}</SettingsHint>
	</SettingsSection>

	<Shortcuts />
</SettingsPanel>
