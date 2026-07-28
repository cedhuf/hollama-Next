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
	import SettingsPanel from './SettingsPanel.svelte';
	import SettingsSection from './SettingsSection.svelte';

	let langValue: string = $derived($settingsStore.userLanguage ?? 'en');

	function changeLanguage({ value }: { value: string; label: string }) {
		const locale = value as Locales;
		loadLocale(locale);
		setLocale(locale);
		$settingsStore.userLanguage = locale;
	}
</script>

<SettingsPanel>
	<SettingsSection title={$LL.appearance()}>
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
	</SettingsSection>

	<SettingsSection title={$LL.homeScreen()}>
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
			<label class="flex items-center justify-between gap-2 pl-11 text-sm text-muted">
				<span>{$LL.howManyToShow()}</span>
				<input
					type="number"
					min="1"
					max="5"
					bind:value={$settingsStore.homeRecentPersonasCount}
					class="settings-field w-16 shrink-0 px-2 py-1"
				/>
			</label>
		{/if}

		<FieldCheckbox
			label={$LL.showRecentSessions()}
			bind:checked={$settingsStore.homeShowRecentSessions}
		/>
		{#if $settingsStore.homeShowRecentSessions}
			<label class="flex items-center justify-between gap-2 pl-11 text-sm text-muted">
				<span>{$LL.howManyToShow()}</span>
				<input
					type="number"
					min="1"
					max="10"
					bind:value={$settingsStore.homeRecentSessionsCount}
					class="settings-field w-16 shrink-0 px-2 py-1"
				/>
			</label>
		{/if}
	</SettingsSection>

	<SettingsSection title={$LL.personas()}>
		<FieldCheckbox
			label={$LL.pinPersonasInSidebar()}
			bind:checked={$settingsStore.showPinnedPersonas}
		/>
	</SettingsSection>
</SettingsPanel>
