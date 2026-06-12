<script lang="ts">
	import { Monitor, Moon, Sun } from '@lucide/svelte';

	import LL, { setLocale } from '$i18n/i18n-svelte';
	import type { Locales } from '$i18n/i18n-types';
	import { loadLocale } from '$i18n/i18n-util.sync';
	import FieldCheckbox from '$lib/components/FieldCheckbox.svelte';
	import FieldSelect from '$lib/components/FieldSelect.svelte';
	import Fieldset from '$lib/components/Fieldset.svelte';
	import P from '$lib/components/P.svelte';
	import { settingsStore } from '$lib/localStorage';

	const numberField =
		'w-16 rounded-md border border-shade-3 bg-shade-0 px-2 py-1 text-sm text-active outline-none focus:border-accent';

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
		{
			value: 'classic',
			label: 'Classic',
			bg: '#ebebeb',
			sidebar: '#f5f5f5',
			accent: '#6366f1',
			text: '#1e293b',
			muted: '#94a3b8'
		},
		{
			value: 'dracula',
			label: 'Dracula',
			bg: '#282a36',
			sidebar: '#1e1f29',
			accent: '#bd93f9',
			text: '#f8f8f2',
			muted: '#6272a4'
		},
		{
			value: 'catppuccin',
			label: 'Catppuccin',
			bg: '#1e1e2e',
			sidebar: '#181825',
			accent: '#cba6f7',
			text: '#cdd6f4',
			muted: '#6c7086'
		}
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

	<!-- Theme style: mini-preview cards -->
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
					<!-- Mini chat app preview -->
					<div class="flex w-full overflow-hidden rounded-md" style="background:{style.bg}">
						<div class="flex w-1/3 flex-col gap-1 p-1.5" style="background:{style.sidebar}">
							<div class="h-1 w-3/4 rounded" style="background:{style.muted}"></div>
							<div class="h-1 w-1/2 rounded" style="background:{style.muted}"></div>
							<div class="h-1 w-2/3 rounded" style="background:{style.muted}"></div>
						</div>
						<div class="flex flex-1 flex-col gap-1 p-1.5">
							<div class="h-1.5 w-3/4 rounded" style="background:{style.text}"></div>
							<div class="self-end rounded-sm px-1 py-0.5" style="background:{style.accent};color:white">
								<div class="h-1 w-6 rounded" style="background:rgba(255,255,255,0.7)"></div>
							</div>
						</div>
					</div>
					<span class="text-xs font-medium">{style.label}</span>
				</button>
			{/each}
		</div>
	</div>
	<!-- Home screen -->
	<div class="flex flex-col gap-2.5 border-t border-shade-3 pt-4">
		<span class="text-sm font-medium">Home screen</span>
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
	</div>

	<!-- Personas -->
	<div class="flex flex-col gap-2.5 border-t border-shade-3 pt-4">
		<span class="text-sm font-medium">Personas</span>
		<FieldCheckbox
			label="Pin personas you talk to at the top of the sidebar"
			bind:checked={$settingsStore.showPinnedPersonas}
		/>
	</div>
</Fieldset>
