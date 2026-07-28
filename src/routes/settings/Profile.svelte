<script lang="ts">
	import LL from '$i18n/i18n-svelte';
	import { isServerMode } from '$lib/chat/endpoint';
	import AvatarEditor from '$lib/components/AvatarEditor.svelte';
	import { settingsStore } from '$lib/localStorage';
	import { currentRole, currentUser } from '$lib/stores/auth';

	import SettingsField from './SettingsField.svelte';
	import SettingsPanel from './SettingsPanel.svelte';
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

	// An OIDC-provisioned identity is owned by the provider: name and avatar are
	// re-read from its claims, so editing them here would silently diverge. The
	// panel stays visible — the fields simply become read-only.
	const oidcManaged = $derived(isServerMode && !!$currentUser?.oidc);
</script>

<SettingsPanel>
	<!-- Identity card -->
	<div class="flex items-center gap-4 rounded-xl border border-shade-3 bg-shade-0 p-4">
		<AvatarEditor
			image={$settingsStore.profileAvatar}
			color={$settingsStore.profileColor}
			{initials}
			colors={PRESET_COLORS}
			readonly={oidcManaged}
			onColorChange={(c) => ($settingsStore.profileColor = c)}
			onImageChange={(url) => ($settingsStore.profileAvatar = url)}
			onImageRemove={() => ($settingsStore.profileAvatar = '')}
		/>

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
			<SettingsField
				label={$LL.firstName()}
				hint={oidcManaged ? 'Managed by your identity provider.' : undefined}
			>
				{#if oidcManaged}
					<input class="settings-field" value={$settingsStore.profileFirstName} disabled />
				{:else}
					<input
						class="settings-field"
						bind:value={$settingsStore.profileFirstName}
						placeholder={$LL.firstName()}
					/>
				{/if}
			</SettingsField>
			<SettingsField
				label={$LL.lastName()}
				hint={oidcManaged ? 'Managed by your identity provider.' : undefined}
			>
				{#if oidcManaged}
					<input class="settings-field" value={$settingsStore.profileLastName} disabled />
				{:else}
					<input
						class="settings-field"
						bind:value={$settingsStore.profileLastName}
						placeholder={$LL.lastName()}
					/>
				{/if}
			</SettingsField>
		</div>

		<!-- Email: editable in local mode; in server mode it's the account email,
		     owned by the IdP/admin and read-only. -->
		{#if isServerMode}
			<SettingsField
				label="Email"
				hint={$currentUser?.oidc
					? 'Managed by your identity provider.'
					: 'Set by your administrator.'}
			>
				<input class="settings-field" value={$currentUser?.email ?? ''} disabled />
			</SettingsField>
		{:else}
			<SettingsField label="Email">
				<input
					class="settings-field"
					type="email"
					placeholder="you@example.com"
					bind:value={$settingsStore.profileEmail}
				/>
			</SettingsField>
		{/if}
	</SettingsSection>
</SettingsPanel>
