<script lang="ts">
	import { Copy } from '@lucide/svelte';

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

	// Kept as a data URL, the way the profile avatar already is, so it survives a
	// reload without anything new to store it in.
	function pickBackground(event: Event) {
		const file = (event.currentTarget as HTMLInputElement).files?.[0];
		if (!file) return;
		const reader = new FileReader();
		reader.onload = () => ($settingsStore.backgroundImage = String(reader.result ?? ''));
		reader.readAsDataURL(file);
	}

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

		<!-- Set apart from the theme picker: same section, different question. -->
		<div class="mt-2">
			<FieldCheckbox
				label={$LL.surfaceTransparency()}
				bind:checked={$settingsStore.surfaceTransparency}
			/>
		</div>
		<!-- The ends say what the track does, the way iOS does it: the same two
		     stacked shapes, see-through on the left and filled on the right. A word
		     at each end would need translating and would still say less. -->
		<div class="flex items-center gap-3 {$settingsStore.surfaceTransparency ? '' : 'opacity-40'}">
			<Copy class="h-4 w-4 shrink-0 text-muted" />
			<div class="min-w-0 flex-1">
				<SettingsSlider
					label={$LL.surfaceTransparencyStrength()}
					bind:value={$settingsStore.surfaceTransparencyLevel}
					min={0}
					max={100}
					step={10}
					midpoint
					showValue={false}
					disabled={!$settingsStore.surfaceTransparency}
				/>
			</div>
			<Copy class="h-4 w-4 shrink-0 fill-current text-muted" />
		</div>
	</SettingsSection>

	<SettingsSection title={$LL.background()} card>
		<!-- The thumbnail is the setting: a file name says nothing about a picture, and
		     what this changes is entirely how the app looks. -->
		<div class="flex items-center gap-3">
			{#if $settingsStore.backgroundImage}
				<img
					src={$settingsStore.backgroundImage}
					alt=""
					class="h-14 w-20 shrink-0 rounded-md border border-shade-3 object-cover"
				/>
			{/if}
			<div class="flex min-w-0 flex-1 flex-wrap items-center gap-2">
				<label
					class="cursor-pointer rounded-md border border-shade-3 bg-shade-0 px-2.5 py-1.5 text-sm text-active transition-colors hover:border-accent"
				>
					{$settingsStore.backgroundImage ? $LL.replaceImage() : $LL.chooseImage()}
					<input type="file" accept="image/*" onchange={pickBackground} class="sr-only" />
				</label>
				{#if $settingsStore.backgroundImage}
					<button
						type="button"
						onclick={() => ($settingsStore.backgroundImage = '')}
						class="rounded-md px-2.5 py-1.5 text-sm text-muted transition-colors hover:text-active"
					>
						{$LL.remove()}
					</button>
				{/if}
			</div>
		</div>
		<SettingsHint>{$LL.backgroundImageHelp()}</SettingsHint>
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
