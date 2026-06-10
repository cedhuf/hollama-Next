<script lang="ts">
	import LL, { setLocale } from '$i18n/i18n-svelte';
	import type { Locales } from '$i18n/i18n-types';
	import type { LocalizedString } from 'typesafe-i18n';
	import { loadLocale } from '$i18n/i18n-util.sync';
	import FieldSelect from '$lib/components/FieldSelect.svelte';
	import FieldSelectModel from '$lib/components/FieldSelectModel.svelte';
	import Fieldset from '$lib/components/Fieldset.svelte';
	import P from '$lib/components/P.svelte';
	import { settingsStore } from '$lib/localStorage';

	let langValue: Locales = $state($settingsStore.userLanguage || 'en');

	$effect(() => {
		langValue = $settingsStore.userLanguage || 'en';
	});

	function changeLanguage() {
		if (!langValue) return;
		loadLocale(langValue);
		setLocale(langValue);
		$settingsStore.userLanguage = langValue;
	}

	let themeModeValue: string = $state($settingsStore.themeMode || 'system');

	$effect(() => {
		themeModeValue = $settingsStore.themeMode || 'system';
	});

	function changeThemeMode() {
		if (!themeModeValue) return;
		$settingsStore.themeMode = themeModeValue as 'system' | 'light' | 'dark';
	}

	let themeStyleValue: string = $state($settingsStore.themeStyle || 'classic');

	$effect(() => {
		themeStyleValue = $settingsStore.themeStyle || 'classic';
	});

	function changeThemeStyle() {
		if (!themeStyleValue) return;
		$settingsStore.themeStyle = themeStyleValue as 'classic' | 'dracula' | 'catppuccin';
	}

	let defaultModelValue = $state($settingsStore.defaultModel || undefined);

	$effect(() => {
		defaultModelValue = $settingsStore.defaultModel || undefined;
	});

	$effect(() => {
		$settingsStore.defaultModel = defaultModelValue || null;
	});
</script>

<Fieldset>
	<P><strong>{$LL.interface()}</strong></P>

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

	<FieldSelect
		name="theme-mode"
		label={"Theme" as unknown as LocalizedString}
		bind:value={themeModeValue}
		allowClear={false}
		allowSearch={false}
		onChange={changeThemeMode}
		options={[
			{ value: 'system', label: 'System' },
			{ value: 'light', label: 'Light' },
			{ value: 'dark', label: 'Dark' }
		]}
	/>

	<FieldSelect
		name="theme-style"
		label={"Theme style" as unknown as LocalizedString}
		bind:value={themeStyleValue}
		allowClear={false}
		allowSearch={false}
		onChange={changeThemeStyle}
		options={[
			{ value: 'classic', label: 'Classic' },
			{ value: 'dracula', label: 'Dracula' },
			{ value: 'catppuccin', label: 'Catppuccin' }
		]}
	/>

	<FieldSelectModel isLabelVisible={true} bind:value={defaultModelValue} />
</Fieldset>
