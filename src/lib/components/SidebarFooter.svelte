<script lang="ts">
	import { Settings2 } from '@lucide/svelte';

	import LL from '$i18n/i18n-svelte';
	import { env } from '$env/dynamic/public';
	import { serversStore, settingsStore } from '$lib/localStorage';
	import { currentRole } from '$lib/stores/auth';
	import { settingsModalOpen } from '$lib/stores/modal';

	interface Props {
		/** The collapsed desktop rail keeps the avatar and drops the name. */
		rail: boolean;
	}

	let { rail }: Props = $props();

	const connected = $derived(
		env.PUBLIC_MODE === 'server' ? true : $serversStore.some((s) => s.isEnabled && s.isVerified)
	);
	const hasName = $derived(!!($settingsStore.profileFirstName || $settingsStore.profileLastName));

	function initials(): string {
		const f = $settingsStore.profileFirstName.trim().charAt(0).toUpperCase();
		const l = $settingsStore.profileLastName.trim().charAt(0).toUpperCase();
		return f + l || '?';
	}
</script>

{#snippet avatar(size: number)}
	{#if hasName}
		<div
			class="flex items-center justify-center rounded-full"
			style="width:{size}px;height:{size}px;background-color:{$settingsStore.profileColor ||
				'#6366f1'}"
		>
			{#if $settingsStore.profileAvatar}
				<img
					src={$settingsStore.profileAvatar}
					alt="Avatar"
					class="h-full w-full rounded-full object-cover"
				/>
			{:else}
				<span class="text-sm font-bold text-shade-0">{initials()}</span>
			{/if}
		</div>
	{:else}
		<div
			class="flex items-center justify-center rounded-full bg-shade-2 text-muted"
			style="width:{size}px;height:{size}px"
		>
			<Settings2 class="h-4 w-4" />
		</div>
	{/if}
{/snippet}

{#snippet connectionDot()}
	<span
		class="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-shade-1 {connected
			? 'bg-positive'
			: 'bg-shade-5'}"
		title={connected ? $LL.connected() : $LL.noServerConnected()}
	></span>
{/snippet}

<!-- The bottom edge of the column, the same material as the top one. -->
<div class="shrink-0 border-t p-2 surface-chrome">
	{#if rail}
		<div class="flex justify-center">
			<button
				onclick={() => ($settingsModalOpen = true)}
				class="relative transition-transform hover:scale-105"
				title={$LL.settings()}
				aria-label={$LL.settings()}
			>
				{@render avatar(36)}
				{@render connectionDot()}
			</button>
		</div>
	{:else}
		<!-- Labelled explicitly: otherwise the accessible name is whatever its
		     children happen to concatenate to ("No server connected Settings
		     Administrator"), which announces badly and is unusable as a handle. -->
		<button
			onclick={() => ($settingsModalOpen = true)}
			aria-label={$LL.settings()}
			class="flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-shade-0"
		>
			<span class="relative shrink-0">
				{@render avatar(36)}
				{@render connectionDot()}
			</span>
			<span class="flex min-w-0 flex-1 flex-col">
				<span class="truncate text-sm font-medium">
					{hasName
						? `${$settingsStore.profileFirstName} ${$settingsStore.profileLastName}`.trim()
						: $LL.settings()}
				</span>
				<span class="text-xs text-muted">
					{$currentRole === 'admin' ? $LL.administrator() : $LL.user()}
				</span>
			</span>
			<span class="shrink-0 text-muted">
				<Settings2 class="h-5 w-5" />
			</span>
		</button>
	{/if}
</div>
