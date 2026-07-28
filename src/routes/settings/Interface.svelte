<script lang="ts">
	import LL, { setLocale } from '$i18n/i18n-svelte';
	import type { Locales } from '$i18n/i18n-types';
	import { loadLocale } from '$i18n/i18n-util.sync';
	import FieldCheckbox from '$lib/components/FieldCheckbox.svelte';
	import FieldSelect from '$lib/components/FieldSelect.svelte';
	import ThemePicker from '$lib/components/ThemePicker.svelte';
	import { settingsStore } from '$lib/localStorage';

	import SettingsPanel from './SettingsPanel.svelte';
	import SettingsSection from './SettingsSection.svelte';

	const numberField =
		'w-16 rounded-md border border-shade-3 bg-shade-0 px-2 py-1 text-sm text-active outline-none focus:border-accent';

	let langValue: string = $derived($settingsStore.userLanguage ?? 'en');

	function changeLanguage({ value }: { value: string; label: string }) {
		const locale = value as Locales;
		loadLocale(locale);
		setLocale(locale);
		$settingsStore.userLanguage = locale;
	}
</script>

<SettingsPanel>
	<SettingsSection title="Appearance">
		<FieldSelect
			name="language"
			label={$LL.language()}
			bind:value={langValue}
			allowClear={false}
			allowSearch={false}
			onChange={changeLanguage}
			options={[
				{ value: 'en', label: 'English' },
				{ value: 'de', label: 'Deutsch' },
				{ value: 'zh-cn', label: '中文 (简体)' },
				{ value: 'es', label: 'Español' },
				{ value: 'fr', label: 'Français' },
				{ value: 'pt-br', label: 'Português (Brasil)' },
				{ value: 'ja', label: '日本語' },
				{ value: 'tr', label: 'Türkçe' },
				{ value: 'vi', label: 'Tiếng Việt' }
			]}
		/>

		<ThemePicker />
	</SettingsSection>

	<SettingsSection title="Home screen">
		<FieldCheckbox label="Show greeting header" bind:checked={$settingsStore.homeShowHeader} />
		<FieldCheckbox
			label="Show prompt suggestions"
			bind:checked={$settingsStore.homeShowSuggestions}
		/>

		<FieldCheckbox
			label="Show recent personas"
			bind:checked={$settingsStore.homeShowRecentPersonas}
		/>
		{#if $settingsStore.homeShowRecentPersonas}
			<label class="flex items-center justify-between gap-2 pl-11 text-sm text-muted">
				<span>How many to show</span>
				<input
					type="number"
					min="1"
					max="5"
					bind:value={$settingsStore.homeRecentPersonasCount}
					class={numberField}
				/>
			</label>
		{/if}

		<FieldCheckbox
			label="Show recent sessions"
			bind:checked={$settingsStore.homeShowRecentSessions}
		/>
		{#if $settingsStore.homeShowRecentSessions}
			<label class="flex items-center justify-between gap-2 pl-11 text-sm text-muted">
				<span>How many to show</span>
				<input
					type="number"
					min="1"
					max="10"
					bind:value={$settingsStore.homeRecentSessionsCount}
					class={numberField}
				/>
			</label>
		{/if}
	</SettingsSection>

	<SettingsSection title="Personas">
		<FieldCheckbox
			label="Pin personas you talk to at the top of the sidebar"
			bind:checked={$settingsStore.showPinnedPersonas}
		/>
	</SettingsSection>
</SettingsPanel>
