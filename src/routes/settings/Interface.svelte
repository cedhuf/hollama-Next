<script lang="ts">
	import { Monitor, Moon, Sun } from '@lucide/svelte';

	import LL, { setLocale } from '$i18n/i18n-svelte';
	import type { Locales } from '$i18n/i18n-types';
	import { loadLocale } from '$i18n/i18n-util.sync';
	import FieldSelect from '$lib/components/FieldSelect.svelte';
	import Fieldset from '$lib/components/Fieldset.svelte';
	import P from '$lib/components/P.svelte';
	import { settingsStore } from '$lib/localStorage';

	let langValue: string = $derived($settingsStore.userLanguage ?? 'en');

	function changeLanguage({ value }: { value: string; label: string }) {
		const locale = value as Locales;
		loadLocale(locale);
		setLocale(locale);
		$settingsStore.userLanguage = locale;
	}

	const themeModes = [
		{ value: 'system', label: 'System', icon: Monitor },
		{ value: 'light', label: 'Light', icon: Sun },
		{ value: 'dark', label: 'Dark', icon: Moon }
	] as const;

	const themeStyles = [
		{ value: 'classic', label: 'Classic', colors: ['#f1f5f9', '#6366f1', '#1e293b'] },
		{ value: 'dracula', label: 'Dracula', colors: ['#282a36', '#bd93f9', '#ff79c6'] },
		{ value: 'catppuccin', label: 'Catppuccin', colors: ['#1e1e2e', '#cba6f7', '#89b4fa'] }
	] as const;
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

	<!-- Theme mode: segmented control -->
	<div class="flex flex-col gap-1.5">
		<span class="text-sm font-medium">{$LL.theme()}</span>
		<div class="inline-flex gap-1 rounded-lg border border-shade-3 bg-shade-0 p-1">
			{#each themeModes as mode (mode.value)}
				{@const Icon = mode.icon}
				<button
					type="button"
					onclick={() => ($settingsStore.themeMode = mode.value)}
					class="flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors
						{$settingsStore.themeMode === mode.value
						? 'bg-shade-2 text-active shadow-sm'
						: 'text-muted hover:text-active'}"
				>
					<Icon class="h-4 w-4" />
					{mode.label}
				</button>
			{/each}
		</div>
	</div>

	<!-- Theme style: color swatch cards -->
	<div class="flex flex-col gap-1.5">
		<span class="text-sm font-medium">{$LL.themeStyle()}</span>
		<div class="grid grid-cols-3 gap-2">
			{#each themeStyles as style (style.value)}
				<button
					type="button"
					onclick={() => ($settingsStore.themeStyle = style.value)}
					class="flex flex-col items-center gap-2 rounded-lg border p-3 transition-colors
						{$settingsStore.themeStyle === style.value
						? 'border-accent bg-shade-1'
						: 'border-shade-3 bg-shade-0 hover:bg-shade-1'}"
				>
					<div class="flex gap-1">
						{#each style.colors as color (color)}
							<span class="h-4 w-4 rounded-full ring-1 ring-black/10" style="background:{color}"
							></span>
						{/each}
					</div>
					<span class="text-xs font-medium">{style.label}</span>
				</button>
			{/each}
		</div>
	</div>
</Fieldset>
