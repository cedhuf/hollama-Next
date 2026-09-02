<script lang="ts">
	import LL from '$i18n/i18n-svelte';
	import AvatarEditor from '$lib/components/AvatarEditor.svelte';
	import { settingsStore } from '$lib/localStorage';
	import { currentRole, currentUser } from '$lib/stores/auth';
	import { hasAccounts } from '$lib/stores/instance';

	import SettingsField from './SettingsField.svelte';
	import SettingsPanel from './SettingsPanel.svelte';
	import SettingsSection from './SettingsSection.svelte';
	import UsageCard from './UsageCard.svelte';

	interface Props {
		/** Off in the welcome tour: see the note beside the card. */
		showUsage?: boolean;
	}

	let { showUsage = true }: Props = $props();

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

	const roleLabels = $derived<Record<'admin' | 'user', string>>({
		admin: $LL.administrator(),
		user: $LL.user()
	});

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
			.join(' ') || $LL.yourName()
	);

	// An account email is the account's, so it is read back from the session. With
	// no accounts there is no such thing, and the address goes back to being a field
	// of the profile.
	const email = $derived($hasAccounts ? ($currentUser?.email ?? '') : $settingsStore.profileEmail);

	// An OIDC-provisioned identity is owned by the provider: name and avatar are
	// re-read from its claims, so editing them here would silently diverge. The
	// fields become read-only rather than the panel disappearing.
	const oidcManaged = $derived(!!$currentUser?.oidc);
</script>

<SettingsPanel>
	<div class="border-shade-3 bg-shade-0 flex items-center gap-4 rounded-xl border p-4">
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
			<span class="text-active truncate text-base font-semibold">{displayName}</span>
			<span class="text-muted text-xs">{roleLabels[$currentRole]}</span>
			{#if email}
				<span class="text-muted mt-0.5 truncate text-xs">{email}</span>
			{/if}
		</div>
	</div>

	<!-- What this account has spent, between who you are and what you may change:
	     a fact about you rather than a setting of yours. Drawn whether or not there
	     is a limit. Not in the welcome tour, where the account is minutes old and
	     every figure is zero. -->
	{#if showUsage}
		<UsageCard />
	{/if}

	<SettingsSection title={$LL.profile()} card>
		<div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
			<SettingsField
				label={$LL.firstName()}
				hint={oidcManaged ? $LL.managedByIdentityProvider() : undefined}
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
				hint={oidcManaged ? $LL.managedByIdentityProvider() : undefined}
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

		<!-- The account's when there are accounts, owned by the IdP or the admin and
		     read-only; the person's own field otherwise. -->
		{#if $hasAccounts}
			<SettingsField
				label="Email"
				hint={$currentUser?.oidc ? $LL.managedByIdentityProvider() : 'Set by your administrator.'}
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
