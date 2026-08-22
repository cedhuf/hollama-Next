<script lang="ts">
	import { Copy, Image as ImageIcon, ImagePlus } from '@lucide/svelte';

	import LL, { setLocale } from '$i18n/i18n-svelte';
	import type { Locales } from '$i18n/i18n-types';
	import { loadLocale } from '$i18n/i18n-util.sync';
	import FieldCheckbox from '$lib/components/FieldCheckbox.svelte';
	import Select from '$lib/components/Select.svelte';
	import ThemePicker from '$lib/components/ThemePicker.svelte';
	import Tooltip from '$lib/components/Tooltip.svelte';
	import { languageOptions } from '$lib/i18n';
	import { canDrawImages } from '$lib/images';
	import { settingsStore } from '$lib/localStorage';
	import { themeLocked } from '$lib/stores/instance';
	import { CUSTOM_MAX_BYTES, PACK_PREFIX, WALLPAPERS, wallpaperThumb } from '$lib/wallpapers';

	import SettingsField from './SettingsField.svelte';
	import SettingsHint from './SettingsHint.svelte';
	import SettingsPanel from './SettingsPanel.svelte';
	import SettingsSection from './SettingsSection.svelte';
	import SettingsSlider from './SettingsSlider.svelte';
	import Shortcuts from './Shortcuts.svelte';

	let langValue: string = $derived($settingsStore.userLanguage ?? 'en');

	const background = $derived($settingsStore.backgroundImage);
	// Anything that is not one of ours is a file the user brought, and it is the
	// only case with a thumbnail of its own to draw.
	const custom = $derived(!!background && !background.startsWith(PACK_PREFIX));

	let tooLarge = $state(false);

	// Kept as a data URL, the way the profile avatar already is, so it survives a
	// reload without anything new to store it in. Which is also why it is measured
	// first: this one goes into settings that travel.
	function pickBackground(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		// Clearing the input is what lets the same file be picked again after it was
		// refused: without it the second choice is not a change, and nothing fires.
		input.value = '';
		if (!file) return;

		tooLarge = file.size > CUSTOM_MAX_BYTES;
		if (tooLarge) return;

		const reader = new FileReader();
		reader.onload = () => ($settingsStore.backgroundImage = String(reader.result ?? ''));
		reader.readAsDataURL(file);
	}

	function choose(value: string) {
		tooLarge = false;
		$settingsStore.backgroundImage = value;
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

		<!-- Absent, not disabled, when the instance has settled it: a row of colours
		     that refuses to be clicked only invites the question. -->
		{#if $themeLocked}
			<SettingsHint>{$LL.themeLockedByAdmin()}</SettingsHint>
		{:else}
			<ThemePicker />
		{/if}

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
			<Copy class="text-muted h-4 w-4 shrink-0" />
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
			<Copy class="text-muted h-4 w-4 shrink-0 fill-current" />
		</div>
	</SettingsSection>

	<SettingsSection title={$LL.background()} card>
		<!-- The thumbnails are the setting: a name says nothing about a picture, and
		     what this changes is entirely how the app looks. They scroll sideways
		     rather than wrapping, so the section keeps its height whatever the pack
		     grows to.

		     Padded rather than flush, because the ring marking the chosen one is drawn
		     outside its tile, and a scroll container clips both its axes: without the
		     room, the top of the ring is simply cut off. The negative margin gives it
		     back, so the row still lines up with the rest of the panel. -->
		<div class="-m-1 flex gap-2 overflow-x-auto p-1" style="scrollbar-width: thin">
			<button
				type="button"
				onclick={() => choose('')}
				aria-pressed={!background}
				class="bg-shade-2 text-muted flex h-14 w-20 shrink-0 items-center justify-center rounded-md border text-xs transition-colors {background
					? 'border-shade-3 hover:border-accent'
					: 'border-accent ring-accent ring-2'}"
			>
				{$LL.noBackground()}
			</button>

			<!-- The user's own picture sits with the others rather than off at the end:
			     it is a choice among them, and the one they went to the most trouble
			     for. -->
			{#if custom}
				<button
					type="button"
					aria-label={$LL.yourImage()}
					aria-pressed="true"
					class="border-accent ring-accent h-14 w-20 shrink-0 rounded-md border bg-cover bg-center ring-2"
					style="background-image: {wallpaperThumb(background)}"
				></button>
			{/if}

			{#each WALLPAPERS as wallpaper (wallpaper.id)}
				{@const value = PACK_PREFIX + wallpaper.id}
				<button
					type="button"
					onclick={() => choose(value)}
					aria-label={wallpaper.name}
					aria-pressed={background === value}
					class="h-14 w-20 shrink-0 rounded-md border bg-cover bg-center transition-colors {background ===
					value
						? 'border-accent ring-accent ring-2'
						: 'border-shade-3 hover:border-accent'}"
					style="background-image: {wallpaper.thumb ?? wallpaper.image}"
				></button>
			{/each}
		</div>

		<!-- Under the row rather than in it. Bringing your own picture is a different
		     act from picking one, it opens a dialog, and it is the one thing here that
		     can be refused, so it says what it is in words. The limit is given before
		     the file dialog opens: learning it afterwards means having chosen for
		     nothing. -->
		<div class="flex flex-wrap items-center gap-2">
			<Tooltip side="top">
				{#snippet trigger({ props })}
					<label
						{...props}
						class="border-shade-3 bg-shade-0 text-active hover:border-accent flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-md border px-2.5 py-1.5 text-sm transition-colors"
					>
						<ImagePlus class="h-4 w-4 shrink-0" />
						{custom ? $LL.replaceImage() : $LL.useYourOwnImage()}
						<input type="file" accept="image/*" onchange={pickBackground} class="sr-only" />
					</label>
				{/snippet}
				{$LL.maxImageSize()}
			</Tooltip>

			{#if custom}
				<button
					type="button"
					onclick={() => choose('')}
					class="text-muted hover:text-active rounded-md px-2.5 py-1.5 text-sm transition-colors"
				>
					{$LL.remove()}
				</button>
			{/if}
		</div>

		{#if tooLarge}
			<p class="text-negative text-xs">{$LL.imageTooLarge()}</p>
		{/if}

		<!-- The same two ends as the transparency track, and the same shape twice
		     rather than two words: sharp on the left, softened on the right, which is
		     literally what the slider does to the picture. Idle without a wallpaper,
		     shown rather than hidden, so the setting does not appear out of nowhere
		     the moment one is chosen. -->
		<div class="flex items-center gap-3 {background ? '' : 'opacity-40'}">
			<ImageIcon class="text-muted h-4 w-4 shrink-0" />
			<div class="min-w-0 flex-1">
				<SettingsSlider
					label={$LL.backgroundBlur()}
					bind:value={$settingsStore.backgroundBlurLevel}
					min={0}
					max={100}
					step={10}
					midpoint
					showValue={false}
					disabled={!background}
				/>
			</div>
			<ImageIcon class="text-muted h-4 w-4 shrink-0 blur-[1.5px]" />
		</div>

		<SettingsHint>{$LL.backgroundImageHelp()}</SettingsHint>
	</SettingsSection>

	<!-- The way to be left alone about it. The offer itself is a dialogue the app
	     does not own, so the opt-out cannot live inside it; it lives here, beside
	     everything else that decides what the app is allowed to do unprompted. -->
	<SettingsSection title={$LL.installApp()} card>
		<FieldCheckbox label={$LL.offerInstall()} bind:checked={$settingsStore.offerInstall} />
		<SettingsHint>{$LL.offerInstallHelp()}</SettingsHint>
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

		<!-- Only where drawing is possible: a switch for a strip that can never have
		     anything in it is a switch about nothing. -->
		{#if $canDrawImages}
			<FieldCheckbox
				label={$LL.showRecentImages()}
				bind:checked={$settingsStore.homeShowRecentImages}
			/>
			{#if $settingsStore.homeShowRecentImages}
				<SettingsSlider
					label={$LL.howManyToShow()}
					bind:value={$settingsStore.homeRecentImagesCount}
				/>
			{/if}
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
			label={$LL.floatingChatHeader()}
			bind:checked={$settingsStore.floatingChatHeader}
		/>
		<SettingsHint>{$LL.floatingChatHeaderHelp()}</SettingsHint>
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
