<script lang="ts">
	import {
		ChevronDown,
		Library,
		MessageSquareText,
		PanelLeft,
		PanelLeftClose,
		Plus,
		Search,
		Settings2
	} from '@lucide/svelte';
	import { fade } from 'svelte/transition';

	import LL from '$i18n/i18n-svelte';
	import { env } from '$env/dynamic/public';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { personasStore, serversStore, sessionsStore, settingsStore } from '$lib/localStorage';
	import { conversedPersonas, launchPersona } from '$lib/personas';
	import {
		formatSessionMetadata,
		getSessionTitle,
		groupSessions,
		type Session,
		type SessionGroupKey
	} from '$lib/sessions';
	import { Sitemap } from '$lib/sitemap';
	import { currentRole } from '$lib/stores/auth';
	import { settingsModalOpen } from '$lib/stores/modal';
	import { updateStatusStore } from '$lib/updates';

	import { generateNewUrl } from './ButtonNew';
	import EmptyMessage from './EmptyMessage.svelte';
	import PersonaAvatar from './PersonaAvatar.svelte';
	import SectionListItem from './SectionListItem.svelte';

	let query = $state('');
	let personasOpen = $state(true);

	const pathname = $derived(page.url.pathname);
	const isCollapsed = $derived(!$settingsStore.sidebarExpanded);
	const onLibrary = $derived(pathname.includes('/library') || pathname.includes('/knowledge'));
	const onChats = $derived(pathname.includes('/sessions'));
	const q = $derived(query.trim().toLowerCase());

	// Personas you've talked to, surfaced atop the list (unless disabled in
	// settings). Their raw session row is hidden below to avoid duplication.
	const personaLaunchers = $derived(
		$settingsStore.showPinnedPersonas ? conversedPersonas($personasStore, $sessionsStore ?? []) : []
	);
	const launcherSessionIds = $derived(
		personaLaunchers.map((p) => p.sessionId).filter((id): id is string => !!id)
	);
	const visibleSessions = $derived(
		($sessionsStore ?? []).filter((s) => !launcherSessionIds.includes(s.id))
	);

	const filteredPersonas = $derived(
		q ? personaLaunchers.filter((p) => p.name.toLowerCase().includes(q)) : personaLaunchers
	);
	const filteredSessions = $derived(
		q
			? visibleSessions.filter((s) => getSessionTitle(s).toLowerCase().includes(q))
			: visibleSessions
	);
	const sessionGroups = $derived(groupSessions(filteredSessions));
	// Searching forces the personas section open so matches always show.
	const showPersonaList = $derived(personasOpen || !!q);

	// Surfaced in the collapsed rail (with a full-title tooltip) for quick reach.
	const recentSessions = $derived(visibleSessions.slice(0, 4));

	const connected = $derived(
		env.PUBLIC_MODE === 'server' ? true : $serversStore.some((s) => s.isEnabled && s.isVerified)
	);

	function toggleExpanded() {
		$settingsStore.sidebarExpanded = !$settingsStore.sidebarExpanded;
	}

	function newChat() {
		goto(generateNewUrl(Sitemap.SESSIONS));
	}

	function getInitials(): string {
		const f = $settingsStore.profileFirstName.trim().charAt(0).toUpperCase();
		const l = $settingsStore.profileLastName.trim().charAt(0).toUpperCase();
		return f + l || '?';
	}

	function sessionInitial(s: Session): string {
		return (getSessionTitle(s).trim().charAt(0) || '#').toUpperCase();
	}

	function groupLabel(key: SessionGroupKey): string {
		switch (key) {
			case 'pinned':
				return $LL.groupPinned();
			case 'today':
				return $LL.groupToday();
			case 'yesterday':
				return $LL.groupYesterday();
			case 'previous7Days':
				return $LL.groupPrevious7Days();
			case 'previous30Days':
				return $LL.groupPrevious30Days();
			case 'older':
				return $LL.groupOlder();
		}
	}

	const hasName = $derived(!!($settingsStore.profileFirstName || $settingsStore.profileLastName));
</script>

{#snippet profileAvatar(size: number)}
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
				<span class="text-sm font-bold text-shade-0">{getInitials()}</span>
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

<!-- Mobile overlay (expanded only) -->
{#if !isCollapsed}
	<div
		class="fixed inset-0 z-20 bg-black/50 lg:hidden"
		transition:fade={{ duration: 100 }}
		onclick={toggleExpanded}
		role="presentation"
	></div>
{/if}

<nav
	class="flex h-full shrink-0 flex-col overflow-hidden bg-shade-1 transition-[transform,width] duration-200 ease-in-out lg:rounded-xl lg:border
		{isCollapsed
		? 'hidden w-16 lg:flex lg:mr-2'
		: 'safe-top safe-bottom fixed inset-y-0 left-0 z-30 w-[90vw] max-w-xs lg:relative lg:z-auto lg:mr-4 lg:w-96 lg:max-w-none'}"
	aria-label="Main navigation"
	data-testid="sidebar"
>
	<!-- Header -->
	<div class="flex h-[var(--app-header-h)] shrink-0 items-center border-b px-4">
		{#if isCollapsed}
			<div class="flex w-full justify-center">
				<button
					onclick={toggleExpanded}
					class="rounded-lg p-2 text-muted transition-colors hover:text-active"
					aria-label={$LL.expandSidebar()}
					title={$LL.expandSidebar()}
				>
					<PanelLeft class="h-5 w-5" />
				</button>
			</div>
		{:else}
			<a href="/sessions" class="flex items-center gap-2">
				<img class="h-8 w-8 shrink-0" src="/favicon.png" alt="Hollama Next logo" />
				<span class="whitespace-nowrap text-lg font-semibold tracking-tight">Hollama Next</span>
			</a>
			<button
				onclick={toggleExpanded}
				class="ml-auto rounded-lg p-2 text-muted transition-colors hover:text-active"
				aria-label={$LL.collapseSidebar()}
				title={$LL.collapseSidebar()}
			>
				<PanelLeftClose class="h-5 w-5" />
			</button>
		{/if}
	</div>

	{#if isCollapsed}
		<!-- Collapsed rail: primary actions + quick launchers -->
		<div class="flex min-h-0 flex-1 flex-col items-center gap-1.5 overflow-y-auto py-3">
			<button
				onclick={newChat}
				title={$LL.newChat()}
				aria-label={$LL.newChat()}
				class="flex h-9 w-9 items-center justify-center rounded-lg bg-accent text-shade-0 transition-opacity hover:opacity-90"
			>
				<Plus class="h-5 w-5" />
			</button>
			<a
				href="/sessions"
				title={$LL.chats()}
				aria-label={$LL.chats()}
				class="flex h-9 w-9 items-center justify-center rounded-lg transition-colors {onChats
					? 'bg-shade-0 text-active'
					: 'text-muted hover:text-active'}"
			>
				<MessageSquareText class="h-5 w-5" />
			</a>
			<a
				href="/library"
				title={$LL.library()}
				aria-label={$LL.library()}
				class="flex h-9 w-9 items-center justify-center rounded-lg transition-colors {onLibrary
					? 'bg-shade-0 text-active'
					: 'text-muted hover:text-active'}"
			>
				<Library class="h-5 w-5" />
			</a>

			{#if personaLaunchers.length > 0}
				<div class="my-1 h-px w-8 bg-shade-3"></div>
				{#each personaLaunchers as persona (persona.id)}
					<button
						type="button"
						onclick={() => goto(`/sessions/${launchPersona(persona, $settingsStore.models)}`)}
						title={persona.name}
						class="transition-transform hover:scale-105"
					>
						<PersonaAvatar {persona} size={32} />
					</button>
				{/each}
			{/if}

			{#if recentSessions.length > 0}
				<div class="my-1 h-px w-8 bg-shade-3"></div>
				{#each recentSessions as session (session.id)}
					<button
						type="button"
						onclick={() => goto(`/sessions/${session.id}`)}
						title={getSessionTitle(session) || $LL.untitled()}
						aria-label={getSessionTitle(session) || $LL.untitled()}
						class="flex h-8 w-8 items-center justify-center rounded-md border text-xs font-medium transition-colors {pathname.includes(
							session.id
						)
							? 'border-accent bg-shade-0 text-active'
							: 'border-shade-3 text-muted hover:text-active'}"
					>
						{sessionInitial(session)}
					</button>
				{/each}
			{/if}
		</div>
	{:else}
		<!-- Top actions -->
		<div class="flex flex-col gap-2 px-3 py-3">
			<button
				onclick={newChat}
				class="flex w-full items-center justify-center gap-2 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-shade-0 transition-opacity hover:opacity-90"
			>
				<Plus class="h-4 w-4" />
				{$LL.newChat()}
			</button>

			<div class="relative">
				<Search
					class="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
				/>
				<input
					bind:value={query}
					type="text"
					placeholder={$LL.searchChatsPersonas()}
					class="w-full rounded-lg border border-shade-3 bg-shade-0 py-2 pl-8 pr-2.5 text-sm outline-none placeholder:text-muted focus:border-accent"
				/>
			</div>

			<div class="flex gap-1.5">
				<a
					href="/sessions"
					class="flex flex-1 items-center justify-center gap-2 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors {onChats
						? 'bg-shade-0 text-active shadow-sm'
						: 'text-muted hover:bg-shade-0 hover:text-active'}"
				>
					<MessageSquareText class="h-4 w-4 shrink-0" />
					{$LL.chats()}
				</a>
				<a
					href="/library"
					class="flex flex-1 items-center justify-center gap-2 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors {onLibrary
						? 'bg-shade-0 text-active shadow-sm'
						: 'text-muted hover:bg-shade-0 hover:text-active'}"
				>
					<Library class="h-4 w-4 shrink-0" />
					{$LL.library()}
				</a>
			</div>
		</div>

		<!-- Scrollable list -->
		<div class="min-h-0 flex-1 overflow-auto px-2 pb-2" style="overscroll-behavior-y: contain">
			{#if filteredPersonas.length > 0}
				<div class="mb-2">
					<button
						type="button"
						onclick={() => (personasOpen = !personasOpen)}
						class="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-accent transition-colors hover:bg-shade-0"
					>
						<span>{$LL.personas()} · {filteredPersonas.length}</span>
						<ChevronDown
							class="h-3.5 w-3.5 transition-transform {showPersonaList ? '' : '-rotate-90'}"
						/>
					</button>
					{#if showPersonaList}
						<div class="flex flex-col gap-0.5">
							{#each filteredPersonas as persona (persona.id)}
								<button
									type="button"
									onclick={() => goto(`/sessions/${launchPersona(persona, $settingsStore.models)}`)}
									class="flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-sm transition-colors hover:bg-shade-0
										{persona.sessionId && pathname.includes(persona.sessionId)
										? 'bg-shade-0 font-medium text-active'
										: 'text-base'}"
									title={persona.tagline}
								>
									<PersonaAvatar {persona} size={26} />
									<span class="truncate">{persona.name}</span>
								</button>
							{/each}
						</div>
					{/if}
				</div>
			{/if}

			{#each sessionGroups as group (group.key)}
				<div class="mb-2">
					<p class="px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-muted">
						{groupLabel(group.key)}
					</p>
					<div class="flex flex-col">
						{#each group.sessions as session (session.id)}
							<SectionListItem
								sitemap={Sitemap.SESSIONS}
								id={session.id}
								title={getSessionTitle(session)}
								subtitle={formatSessionMetadata(session)}
								pinned={session.pinned}
							/>
						{/each}
					</div>
				</div>
			{/each}

			{#if sessionGroups.length === 0 && filteredPersonas.length === 0}
				<EmptyMessage>{q ? $LL.noMatches() : $LL.emptySessions()}</EmptyMessage>
			{/if}
		</div>
	{/if}

	<!-- Footer: profile + settings -->
	<div class="mt-auto border-t p-2">
		{#if isCollapsed}
			<div class="flex justify-center">
				<button
					onclick={() => ($settingsModalOpen = true)}
					class="relative transition-transform hover:scale-105"
					title={$LL.settings()}
					aria-label={$LL.settings()}
				>
					{@render profileAvatar(36)}
					{@render connectionDot()}
					{#if $updateStatusStore.showSidebarNotification}
						<span
							class="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-warning"
							title="Update available"
						></span>
					{/if}
				</button>
			</div>
		{:else}
			<button
				onclick={() => ($settingsModalOpen = true)}
				class="flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-shade-0"
			>
				<span class="relative shrink-0">
					{@render profileAvatar(36)}
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
				<span class="relative shrink-0 text-muted">
					<Settings2 class="h-5 w-5" />
					{#if $updateStatusStore.showSidebarNotification}
						<span class="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-warning"></span>
					{/if}
				</span>
			</button>
		{/if}
	</div>
</nav>
