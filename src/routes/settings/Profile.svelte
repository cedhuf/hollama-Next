<script lang="ts">
	import LL from '$i18n/i18n-svelte';
	import FieldInput from '$lib/components/FieldInput.svelte';
	import FieldSelect from '$lib/components/FieldSelect.svelte';
	import Fieldset from '$lib/components/Fieldset.svelte';
	import P from '$lib/components/P.svelte';
	import { settingsStore } from '$lib/localStorage';

	const PRESET_COLORS = [
		'#6366f1',
		'#8b5cf6',
		'#ec4899',
		'#f43f5e',
		'#f97316',
		'#eab308',
		'#22c55e',
		'#14b8a6',
		'#06b6d4',
		'#3b82f6'
	];

	let firstNameValue = $state($settingsStore.profileFirstName ?? '');
	let lastNameValue = $state($settingsStore.profileLastName ?? '');
	let roleValue = $state<'admin' | 'user'>($settingsStore.profileRole ?? 'user');
	let avatarValue = $state($settingsStore.profileAvatar ?? '');
	let colorValue = $state($settingsStore.profileColor ?? PRESET_COLORS[0]);

	$effect(() => {
		$settingsStore.profileFirstName = firstNameValue;
	});

	$effect(() => {
		$settingsStore.profileLastName = lastNameValue;
	});

	$effect(() => {
		$settingsStore.profileRole = roleValue;
	});

	$effect(() => {
		$settingsStore.profileAvatar = avatarValue;
	});

	$effect(() => {
		$settingsStore.profileColor = colorValue;
	});

	function getInitials(first: string, last: string): string {
		const f = first.trim().charAt(0).toUpperCase();
		const l = last.trim().charAt(0).toUpperCase();
		return f + l || f || '?';
	}

	function getDisplayName(first: string, last: string): string {
		const parts = [first.trim(), last.trim()].filter(Boolean);
		return parts.join(' ') || 'Your Name';
	}

	const roleLabel: Record<'admin' | 'user', string> = {
		admin: 'Administrator',
		user: 'User'
	};
</script>

<Fieldset>
	<P><strong>{$LL.profile()}</strong></P>

	<FieldInput
		name="profile-first-name"
		label={"First name" as unknown as import('typesafe-i18n').LocalizedString}
		bind:value={firstNameValue}
		placeholder={"First name" as unknown as import('typesafe-i18n').LocalizedString}
	/>

	<FieldInput
		name="profile-last-name"
		label={"Last name" as unknown as import('typesafe-i18n').LocalizedString}
		bind:value={lastNameValue}
		placeholder={"Last name" as unknown as import('typesafe-i18n').LocalizedString}
	/>

	<FieldSelect
		name="profile-role"
		label={"Role" as unknown as import('typesafe-i18n').LocalizedString}
		bind:value={roleValue}
		allowClear={false}
		allowSearch={false}
		options={[
			{ value: 'user', label: 'User' },
			{ value: 'admin', label: 'Administrator' }
		]}
	/>

	<div class="field-wrapper">
		<div class="field-label-root">Avatar URL (optional)</div>
		<div class="field-container">
			<input
				id="profile-avatar"
				type="text"
				class="field-input"
				placeholder="https://example.com/avatar.jpg"
				bind:value={avatarValue}
			/>
		</div>
	</div>

	<div class="field-wrapper">
		<div class="field-label-root">Avatar color</div>
		<div class="color-swatches">
			{#each PRESET_COLORS as presetColor}
				<button
					onclick={() => (colorValue = presetColor)}
					class="color-swatch"
					class:color-swatch--active={colorValue === presetColor}
					style="background-color: {presetColor}"
					aria-label={presetColor}
				></button>
			{/each}
		</div>
	</div>

	<div class="preview-section">
		<div class="field-label-root">Preview</div>
		<div class="preview-card">
			<div class="avatar-circle" style="background-color: {colorValue}">
				{#if avatarValue}
					<img src={avatarValue} alt="Avatar" class="avatar-image" />
				{:else}
					<span class="avatar-initials">{getInitials(firstNameValue, lastNameValue)}</span>
				{/if}
			</div>
			<div class="preview-info">
				<span class="preview-name">{getDisplayName(firstNameValue, lastNameValue)}</span>
				<span class="preview-role">{roleLabel[roleValue]}</span>
			</div>
		</div>
	</div>
</Fieldset>

<style lang="postcss">
	.field-wrapper {
		@apply flex flex-col gap-y-1;
	}

	.field-label-root {
		@apply flex items-center gap-x-2 px-3 pb-0.5 pt-3 text-xs font-medium leading-none;
	}

	.field-container {
		@apply flex w-full flex-col gap-y-1 rounded-md border bg-shade-0 text-sm;
		@apply focus-within:border-shade-6 focus-within:outline focus-within:outline-shade-2;
	}

	.field-input {
		@apply base-input;
	}

	.color-swatches {
		@apply flex flex-wrap gap-2 rounded-md border bg-shade-0 px-3 py-3;
	}

	.color-swatch {
		@apply h-7 w-7 rounded-full border-2 border-transparent transition-all;
	}

	.color-swatch--active {
		@apply border-shade-6 scale-110;
	}

	.preview-section {
		@apply flex flex-col gap-y-2;
	}

	.preview-card {
		@apply flex items-center gap-3 rounded-md border bg-shade-0 px-4 py-3;
	}

	.avatar-circle {
		@apply flex h-10 w-10 shrink-0 items-center justify-center rounded-full;
	}

	.avatar-initials {
		@apply text-sm font-bold text-white;
	}

	.avatar-image {
		@apply h-10 w-10 rounded-full object-cover;
	}

	.preview-info {
		@apply flex flex-col;
	}

	.preview-name {
		@apply text-sm font-medium;
	}

	.preview-role {
		@apply text-xs text-muted;
	}
</style>
