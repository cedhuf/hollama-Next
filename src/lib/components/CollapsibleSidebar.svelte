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

	import LL from '$i18n/i18n-svelte';
	import { env } from '$env/dynamic/public';
	import { browser } from '$app/environment';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { APP_NAME } from '$lib/brand';
	import Logo from '$lib/components/Logo.svelte';
	import { personasStore, serversStore, sessionsStore, settingsStore } from '$lib/localStorage';
	import { conversedPersonas, launchPersona } from '$lib/personas';
	import {
		formatSessionMetadata,
		groupSessions,
		resolveSessionTitle,
		type SessionGroupKey,
		type SessionSummary
	} from '$lib/sessions';
	import { Sitemap } from '$lib/sitemap';
	import { currentRole } from '$lib/stores/auth';
	import { openSearch, settingsModalOpen } from '$lib/stores/modal';
	import { mobileDrawerOpen } from '$lib/stores/sidebar';

	import { generateNewUrl } from './ButtonNew';
	import EmptyMessage from './EmptyMessage.svelte';
	import PersonaAvatar from './PersonaAvatar.svelte';
	import SectionListItem from './SectionListItem.svelte';

	let query = $state('');
	let personasOpen = $state(true);

	const pathname = $derived(page.url.pathname);
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
			? visibleSessions.filter((s) => resolveSessionTitle(s).toLowerCase().includes(q))
			: visibleSessions
	);
	const sessionGroups = $derived(groupSessions(filteredSessions));
	// Searching forces the personas section open so matches always show.
	const showPersonaList = $derived(personasOpen || !!q);

	// Balanced columns for the persona grid: fill rows evenly (4→4, 6→3, 5→3…),
	// capped at 4 so avatars stay a reasonable size.
	const personaCols = $derived.by(() => {
		const n = filteredPersonas.length;
		if (n <= 1) return 1;
		const rows = Math.ceil(n / 4);
		return Math.ceil(n / rows);
	});

	// Surfaced in the collapsed rail (with a full-title tooltip) for quick reach.
	const recentSessions = $derived(visibleSessions.slice(0, 4));

	const connected = $derived(
		env.PUBLIC_MODE === 'server' ? true : $serversStore.some((s) => s.isEnabled && s.isVerified)
	);

	// Mobile drawer open/close is transient (sidebar store, starts closed); desktop
	// rail/full is the persisted sidebarExpanded preference. Kept separate so the
	// drawer never persists and the two modes don't fight over one boolean.
	let isMobile = $state(false);
	$effect(() => {
		if (!browser) return;
		const mq = window.matchMedia('(max-width: 1023px)');
		const sync = () => (isMobile = mq.matches);
		sync();
		mq.addEventListener('change', sync);
		return () => mq.removeEventListener('change', sync);
	});

	// The desktop icon rail only exists when collapsed on desktop; mobile is always the full drawer.
	const showRail = $derived(!isMobile && !$settingsStore.sidebarExpanded);

	function expandSidebar() {
		$settingsStore.sidebarExpanded = true;
	}
	function collapseOrClose() {
		if (isMobile) mobileDrawerOpen.set(false);
		else $settingsStore.sidebarExpanded = false;
	}

	function newChat() {
		goto(generateNewUrl(Sitemap.SESSIONS));
	}

	function getInitials(): string {
		const f = $settingsStore.profileFirstName.trim().charAt(0).toUpperCase();
		const l = $settingsStore.profileLastName.trim().charAt(0).toUpperCase();
		return f + l || '?';
	}

	function sessionInitial(s: SessionSummary): string {
		return (resolveSessionTitle(s).trim().charAt(0) || '#').toUpperCase();
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

<!-- Mobile: a fixed, stationary drawer pinned under the page (iOS reveal) — the page
     slides aside to uncover it, the sidebar itself never moves. Desktop: an in-flow
     rail/full column driven by the persisted sidebarExpanded. -->
<nav
	class="fixed inset-y-0 left-0 flex h-full w-[min(84vw,22rem)] shrink-0 flex-col overflow-hidden bg-shade-1 transition-[width] duration-200 ease-in-out lg:relative lg:z-auto lg:max-w-none lg:translate-x-0 lg:rounded-xl lg:border
		{$settingsStore.sidebarExpanded ? 'lg:mr-4 lg:w-96' : 'lg:mr-2 lg:w-16'}"
	aria-label="Main navigation"
	data-testid="sidebar"
>
	<!-- Header -->
	<div class="flex h-[var(--app-header-h)] shrink-0 items-center border-b px-4">
		{#if showRail}
			<div class="flex w-full justify-center">
				<button
					onclick={expandSidebar}
					class="rounded-lg p-2 text-muted transition-colors hover:text-active"
					aria-label={$LL.expandSidebar()}
					title={$LL.expandSidebar()}
				>
					<PanelLeft class="h-5 w-5" />
				</button>
			</div>
		{:else}
			<a href={resolve('/sessions')} class="flex items-center gap-2">
				<Logo class="h-8 w-8 shrink-0" />
				<span class="whitespace-nowrap text-lg font-semibold tracking-tight">{APP_NAME}</span>
			</a>
			<button
				onclick={collapseOrClose}
				class="ml-auto rounded-lg p-2 text-muted transition-colors hover:text-active"
				aria-label={$LL.collapseSidebar()}
				title={$LL.collapseSidebar()}
			>
				<PanelLeftClose class="h-5 w-5" />
			</button>
		{/if}
	</div>

	{#if showRail}
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
				href={resolve('/sessions')}
				title={$LL.chats()}
				aria-label={$LL.chats()}
				class="flex h-9 w-9 items-center justify-center rounded-lg transition-colors {onChats
					? 'bg-shade-0 text-active'
					: 'text-muted hover:text-active'}"
			>
				<MessageSquareText class="h-5 w-5" />
			</a>
			<a
				href={resolve('/library')}
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
						onclick={() =>
							goto(
								resolve('/sessions/[id]', { id: launchPersona(persona, $settingsStore.models) })
							)}
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
						onclick={() => goto(resolve('/sessions/[id]', { id: session.id }))}
						title={resolveSessionTitle(session) || $LL.untitled()}
						aria-label={resolveSessionTitle(session) || $LL.untitled()}
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

			<!-- The field above filters titles; this is the way out to the content of
			     every conversation. Offered rather than configured: the choice belongs
			     to the moment, not to a setting. -->
			{#if q}
				<button
					type="button"
					onclick={() => openSearch(query)}
					class="flex w-full items-center gap-2 rounded-lg border border-shade-3 px-2.5 py-2 text-left text-sm text-muted transition-colors hover:bg-shade-0 hover:text-active"
				>
					<Search class="h-4 w-4 shrink-0" />
					<span class="truncate">{$LL.searchAllConversations({ query })}</span>
				</button>
			{/if}

			<div class="flex gap-1.5">
				<a
					href={resolve('/sessions')}
					class="flex flex-1 items-center justify-center gap-2 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors {onChats
						? 'bg-shade-0 text-active shadow-sm'
						: 'text-muted hover:bg-shade-0 hover:text-active'}"
				>
					<MessageSquareText class="h-4 w-4 shrink-0" />
					{$LL.chats()}
				</a>
				<a
					href={resolve('/library')}
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
						<!-- iOS Messages-style grid: avatars in balanced rows, partial rows centred. -->
						<div class="flex flex-wrap justify-center gap-1 pb-1 pt-1">
							{#each filteredPersonas as persona (persona.id)}
								{@const active = !!persona.sessionId && pathname.includes(persona.sessionId)}
								<button
									type="button"
									onclick={() =>
										goto(
											resolve('/sessions/[id]', {
												id: launchPersona(persona, $settingsStore.models)
											})
										)}
									style="flex: 0 0 calc(100% / {personaCols} - 0.25rem)"
									class="flex flex-col items-center gap-1.5 rounded-xl px-1 py-2 transition-colors hover:bg-shade-0"
									title={persona.tagline || persona.name}
								>
									<span
										class="relative inline-flex rounded-full {active
											? 'ring-2 ring-accent ring-offset-2 ring-offset-shade-1'
											: ''}"
									>
										<PersonaAvatar {persona} size={44} />
									</span>
									<span
										class="w-full truncate text-center text-xs {active
											? 'font-medium text-active'
											: 'text-muted'}"
									>
										{persona.name}
									</span>
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
					<!-- A hair of space between rows: hovering the neighbour of the active
					     session used to butt two rounded highlights against each other. -->
					<div class="flex flex-col gap-0.5">
						{#each group.sessions as session (session.id)}
							<SectionListItem
								sitemap={Sitemap.SESSIONS}
								id={session.id}
								title={resolveSessionTitle(session)}
								subtitle={formatSessionMetadata(session, $serversStore)}
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
		{#if showRail}
			<div class="flex justify-center">
				<button
					onclick={() => ($settingsModalOpen = true)}
					class="relative transition-transform hover:scale-105"
					title={$LL.settings()}
					aria-label={$LL.settings()}
				>
					{@render profileAvatar(36)}
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
				<span class="shrink-0 text-muted">
					<Settings2 class="h-5 w-5" />
				</span>
			</button>
		{/if}
	</div>
</nav>
