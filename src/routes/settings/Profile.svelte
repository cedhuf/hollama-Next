<script lang="ts">
	import { ImagePlus, Pencil, Trash2 } from '@lucide/svelte';
	import { fade } from 'svelte/transition';

	import LL from '$i18n/i18n-svelte';
	import { isServerMode } from '$lib/chat/endpoint';
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

	// Avatar editing (colour + image) lives in a popover on the avatar itself, mirroring
	// the persona editor — colour swatches only show when there's no picture.
	let avatarMenuOpen = $state(false);

	function uploadImage() {
		const input = document.createElement('input');
		input.type = 'file';
		input.accept = 'image/png,image/jpeg,image/webp';
		input.onchange = () => {
			const file = input.files?.[0];
			if (!file) return;
			const reader = new FileReader();
			reader.onload = (e) => {
				$settingsStore.profileAvatar = e.target?.result as string;
			};
			reader.readAsDataURL(file);
		};
		input.click();
	}

	function removeImage() {
		$settingsStore.profileAvatar = '';
	}
</script>

<SettingsPanel>
	<!-- Identity card -->
	<div class="flex items-center gap-4 rounded-xl border border-shade-3 bg-shade-0 p-4">
		<div class="relative shrink-0">
			{#if oidcManaged}
				<div
					class="flex h-16 w-16 items-center justify-center overflow-hidden rounded-full text-xl font-bold text-white ring-2 ring-shade-3"
					style="background-color: {$settingsStore.profileColor}"
				>
					{#if $settingsStore.profileAvatar}
						<img
							src={$settingsStore.profileAvatar}
							alt="Avatar"
							class="h-full w-full object-cover"
						/>
					{:else}
						{initials}
					{/if}
				</div>
			{:else}
				<button
					type="button"
					onclick={() => (avatarMenuOpen = !avatarMenuOpen)}
					title="Edit avatar"
					aria-label="Edit avatar"
					class="group relative flex h-16 w-16 items-center justify-center overflow-hidden rounded-full text-xl font-bold text-white ring-2 ring-shade-3"
					style="background-color: {$settingsStore.profileColor}"
				>
					{#if $settingsStore.profileAvatar}
						<img
							src={$settingsStore.profileAvatar}
							alt="Avatar"
							class="h-full w-full object-cover"
						/>
					{:else}
						{initials}
					{/if}
					<span
						class="absolute inset-0 flex items-center justify-center bg-black/40 text-white opacity-0 transition-opacity group-hover:opacity-100"
					>
						<Pencil class="h-4 w-4" />
					</span>
				</button>
			{/if}

			{#if avatarMenuOpen}
				<button
					class="fixed inset-0 z-10 cursor-default"
					aria-label="Dismiss"
					onclick={() => (avatarMenuOpen = false)}
				></button>
				<div
					class="absolute left-0 top-full z-20 mt-2 w-52 rounded-xl border border-shade-3 bg-shade-0 p-2 shadow-lg"
					transition:fade={{ duration: 80 }}
				>
					{#if $settingsStore.profileAvatar}
						<button
							type="button"
							onclick={() => {
								avatarMenuOpen = false;
								uploadImage();
							}}
							class="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm text-active transition-colors hover:bg-shade-1"
						>
							<ImagePlus class="h-4 w-4 shrink-0 text-muted" /> Replace picture
						</button>
						<button
							type="button"
							onclick={() => {
								removeImage();
								avatarMenuOpen = false;
							}}
							class="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm text-active transition-colors hover:bg-shade-1"
						>
							<Trash2 class="h-4 w-4 shrink-0 text-muted" /> Remove picture
						</button>
					{:else}
						<div class="grid grid-cols-4 gap-2 p-1">
							{#each PRESET_COLORS as presetColor (presetColor)}
								<button
									type="button"
									aria-label="Choose avatar colour"
									onclick={() => ($settingsStore.profileColor = presetColor)}
									class="h-8 w-8 rounded-full ring-2 ring-offset-2 ring-offset-shade-0 transition-all {$settingsStore.profileColor ===
									presetColor
										? 'ring-accent'
										: 'ring-transparent hover:ring-shade-4'}"
									style="background-color: {presetColor}"
								></button>
							{/each}
						</div>
						<div class="my-1 border-t border-shade-2"></div>
						<button
							type="button"
							onclick={() => {
								avatarMenuOpen = false;
								uploadImage();
							}}
							class="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm text-active transition-colors hover:bg-shade-1"
						>
							<ImagePlus class="h-4 w-4 shrink-0 text-muted" /> Upload a picture
						</button>
					{/if}
				</div>
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
