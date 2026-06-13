<script lang="ts">
	import LL from '$i18n/i18n-svelte';
	import { isServerMode } from '$lib/chat/endpoint';
	import FieldInput from '$lib/components/FieldInput.svelte';
	import { settingsStore } from '$lib/localStorage';
	import { currentRole, currentUser } from '$lib/stores/auth';

	import SettingsSection from './SettingsSection.svelte';

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

	const roleLabels: Record<'admin' | 'user', string> = {
		admin: 'Administrator',
		user: 'User'
	};

	const initials = $derived(
		(
			($settingsStore.profileFirstName.trim().charAt(0) || '') +
			($settingsStore.profileLastName.trim().charAt(0) || '')
		)
			.toUpperCase()
			.trim() || '?'
	);

	const displayName = $derived(
		[$settingsStore.profileFirstName.trim(), $settingsStore.profileLastName.trim()]
			.filter(Boolean)
			.join(' ') || 'Your name'
	);

	const email = $derived(isServerMode ? ($currentUser?.email ?? '') : $settingsStore.profileEmail);
</script>

<div class="mx-auto flex max-w-[80ch] flex-col gap-6">
	<!-- Identity card -->
	<div class="flex items-center gap-4 rounded-xl border border-shade-3 bg-shade-0 p-4">
		<div
			class="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full ring-2 ring-shade-3"
			style="background-color: {$settingsStore.profileColor}"
		>
			{#if $settingsStore.profileAvatar}
				<img src={$settingsStore.profileAvatar} alt="Avatar" class="h-full w-full object-cover" />
			{:else}
				<span class="text-xl font-bold text-white">{initials}</span>
			{/if}
		</div>
		<div class="flex min-w-0 flex-col">
			<span class="truncate text-base font-semibold text-active">{displayName}</span>
			<span class="text-xs text-muted">{roleLabels[$currentRole]}</span>
			{#if email}
				<span class="mt-0.5 truncate text-xs text-muted">{email}</span>
			{/if}
		</div>
	</div>

	<!-- Identity -->
	<SettingsSection title={$LL.profile()}>
		<div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
			<FieldInput
				name="profile-first-name"
				label={$LL.firstName()}
				bind:value={$settingsStore.profileFirstName}
				placeholder={$LL.firstName()}
			/>
			<FieldInput
				name="profile-last-name"
				label={$LL.lastName()}
				bind:value={$settingsStore.profileLastName}
				placeholder={$LL.lastName()}
			/>
		</div>

		<!-- Email: editable in local mode; in server mode it's the account email,
		     owned by the IdP/admin and read-only. -->
		<div class="flex flex-col gap-1">
			<span class="text-sm font-medium">Email</span>
			{#if isServerMode}
				<input class="settings-field" value={$currentUser?.email ?? ''} disabled />
				<span class="text-xs text-muted">
					{$currentUser?.oidc ? 'Managed by your identity provider.' : 'Set by your administrator.'}
				</span>
			{:else}
				<input
					class="settings-field"
					type="email"
					placeholder="you@example.com"
					bind:value={$settingsStore.profileEmail}
				/>
			{/if}
		</div>
	</SettingsSection>

	<!-- Avatar -->
	<SettingsSection
		title={$LL.avatarColor()}
		description="Used for your initials avatar. A picture URL below overrides it."
	>
		<div class="flex flex-wrap items-center gap-2">
			{#each PRESET_COLORS as presetColor (presetColor)}
				<button
					type="button"
					onclick={() => ($settingsStore.profileColor = presetColor)}
					class="h-8 w-8 rounded-full ring-2 ring-offset-2 ring-offset-shade-1 transition-all
						{$settingsStore.profileColor === presetColor
						? 'ring-accent'
						: 'ring-transparent hover:ring-shade-4'}"
					style="background-color: {presetColor}"
					aria-label={presetColor}
				></button>
			{/each}
			<input
				type="color"
				bind:value={$settingsStore.profileColor}
				title="Custom colour"
				aria-label="Custom colour"
				class="h-8 w-8 cursor-pointer rounded-full border border-shade-3 bg-transparent p-0"
			/>
		</div>

		<FieldInput
			name="profile-avatar"
			label={$LL.avatarUrl()}
			bind:value={$settingsStore.profileAvatar}
			placeholder="https://example.com/avatar.jpg"
		/>
	</SettingsSection>
</div>
