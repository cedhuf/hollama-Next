<script lang="ts">
	import LL from '$i18n/i18n-svelte';
	import { isServerMode } from '$lib/chat/endpoint';
	import FieldInput from '$lib/components/FieldInput.svelte';
	import Fieldset from '$lib/components/Fieldset.svelte';
	import P from '$lib/components/P.svelte';
	import { settingsStore } from '$lib/localStorage';
	import { currentRole, currentUser } from '$lib/stores/auth';

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
</script>

<Fieldset>
	<P><strong>{$LL.profile()}</strong></P>

	<!-- Live avatar preview -->
	<div class="flex flex-col items-center gap-2 py-2">
		<div
			class="flex h-20 w-20 items-center justify-center overflow-hidden rounded-full ring-2 ring-shade-3"
			style="background-color: {$settingsStore.profileColor}"
		>
			{#if $settingsStore.profileAvatar}
				<img src={$settingsStore.profileAvatar} alt="Avatar" class="h-full w-full object-cover" />
			{:else}
				<span class="text-2xl font-bold text-white">{initials}</span>
			{/if}
		</div>
		<div class="flex flex-col items-center">
			<span class="text-base font-semibold">{displayName}</span>
			<span class="text-xs text-muted">{roleLabels[$currentRole]}</span>
		</div>
	</div>

	<!-- Identity -->
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

	<!-- Account email (server mode) — owned by the IdP/admin, not self-editable -->
	{#if isServerMode && $currentUser}
		<div class="flex flex-col gap-1">
			<span class="text-sm font-medium">Email</span>
			<input class="field-input base-input" value={$currentUser.email} disabled />
			<span class="text-xs text-muted">
				{$currentUser.oidc ? 'Managed by your identity provider.' : 'Set by your administrator.'}
			</span>
		</div>
	{/if}

	<!-- Avatar color -->
	<div class="flex flex-col gap-1.5">
		<span class="text-sm font-medium">{$LL.avatarColor()}</span>
		<div class="flex flex-wrap gap-2">
			{#each PRESET_COLORS as presetColor (presetColor)}
				<button
					type="button"
					onclick={() => ($settingsStore.profileColor = presetColor)}
					class="h-8 w-8 rounded-full ring-2 ring-offset-2 ring-offset-shade-1 transition-all
						{$settingsStore.profileColor === presetColor
						? 'ring-shade-6'
						: 'ring-transparent hover:ring-shade-4'}"
					style="background-color: {presetColor}"
					aria-label={presetColor}
				></button>
			{/each}
		</div>
	</div>

	<FieldInput
		name="profile-avatar"
		label={$LL.avatarUrl()}
		bind:value={$settingsStore.profileAvatar}
		placeholder="https://example.com/avatar.jpg"
	/>
</Fieldset>
