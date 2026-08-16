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

<!-- The same 2rem the mark occupies at the other end of the column, and not by
     coincidence. The rail centres what it holds; the open column starts it at the
     gutter. An element only sits in the same place under both rules when its width
     matches the gutter on either side of it, which is why the mark never moved and
     why the avatar, four pixels wider, did. -->
{#snippet avatar()}
	{#if hasName}
		<div
			class="flex h-8 w-8 items-center justify-center rounded-full"
			style="background-color:{$settingsStore.profileColor || '#6366f1'}"
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
		<div class="flex h-8 w-8 items-center justify-center rounded-full bg-shade-2 text-muted">
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

<!-- The dot hangs off the avatar's corner, so it is the avatar that has to be the
     positioning context. Given to the surrounding button instead, it would sit in
     the corner of whatever that button happens to measure, which is not the same
     box in the rail as it is in the open column. Hence one snippet for the pair
     rather than two places that have to agree. -->
{#snippet identity()}
	<span class="relative shrink-0">
		{@render avatar()}
		{@render connectionDot()}
	</span>
{/snippet}

<!-- The bottom edge of the column, the same material as the top one. -->
<div class="flex shrink-0 border-t surface-chrome">
	<!-- Full width for the material, fixed width for the layout: see `SidebarBrand`. -->
	<div
		class="w-full shrink-0 p-2 max-lg:w-[var(--drawer-w)] max-lg:pb-[max(0.5rem,env(safe-area-inset-bottom))] {rail
			? 'lg:w-16'
			: 'lg:w-96'}"
	>
		{#if rail}
			<div class="flex justify-center">
				<button
					onclick={() => ($settingsModalOpen = true)}
					class="flex h-12 items-center transition-transform hover:scale-105"
					title={$LL.settings()}
					aria-label={$LL.settings()}
				>
					{@render identity()}
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
				{@render identity()}
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
