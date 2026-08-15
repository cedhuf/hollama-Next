<script lang="ts">
	import { Settings2, Smartphone } from '@lucide/svelte';

	import LL from '$i18n/i18n-svelte';
	import { env } from '$env/dynamic/public';
	import { browser } from '$app/environment';
	import { isInstalled, openInstallDialog } from '$lib/install';
	import { serversStore, settingsStore } from '$lib/localStorage';
	import { currentRole } from '$lib/stores/auth';
	import { settingsModalOpen } from '$lib/stores/modal';

	import Tooltip from './Tooltip.svelte';

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
<div class="flex shrink-0 border-t surface-chrome">
	<!-- Full width for the material, fixed width for the layout: see `SidebarBrand`. -->
	<div
		class="w-full shrink-0 p-2 max-lg:pb-[max(0.5rem,env(safe-area-inset-bottom))] {rail
			? 'lg:w-16'
			: 'lg:w-96'}"
	>
		<!-- Standing here rather than appearing once and being gone. On the platforms
	     that matter most there is no install button anywhere in the browser, only a
	     gesture nobody knows, and the one place someone thinks to look for it is the
	     app itself. Read once, when the column is drawn: nothing installs an app
	     halfway through a session except the offer, which hides itself. -->
		{#if browser && !isInstalled()}
			{#if rail}
				<div class="mb-1 flex justify-center">
					<Tooltip side="right">
						{#snippet trigger({ props })}
							<button
								{...props}
								type="button"
								onclick={openInstallDialog}
								aria-label={$LL.installApp()}
								class="flex h-9 w-9 items-center justify-center rounded-lg text-muted transition-colors hover:text-active"
							>
								<Smartphone class="h-5 w-5" />
							</button>
						{/snippet}
						{$LL.installApp()}
					</Tooltip>
				</div>
			{:else}
				<button
					type="button"
					onclick={openInstallDialog}
					class="mb-1 flex h-9 w-full items-center gap-3 rounded-lg px-2 text-left text-sm text-muted transition-colors hover:bg-shade-0 hover:text-active"
				>
					<Smartphone class="h-4 w-4 shrink-0" />
					<span class="truncate">{$LL.installApp()}</span>
				</button>
			{/if}
		{/if}

		{#if rail}
			<div class="flex justify-center">
				<button
					onclick={() => ($settingsModalOpen = true)}
					class="relative flex h-12 items-center transition-transform hover:scale-105"
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
				class="flex h-12 w-full items-center gap-3 rounded-lg px-2 text-left transition-colors hover:bg-shade-0"
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
</div>
