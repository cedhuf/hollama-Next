<script lang="ts">
	import {
		Library,
		MessageSquareText,
		PanelLeft,
		PanelLeftClose,
		Plus,
		Settings2
	} from '@lucide/svelte';
	import { fade } from 'svelte/transition';

	import LL from '$i18n/i18n-svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { knowledgeStore, personasStore, sessionsStore, settingsStore } from '$lib/localStorage';
	import { conversedPersonas, launchPersona } from '$lib/personas';
	import { formatSessionMetadata, getSessionTitle } from '$lib/sessions';
	import { Sitemap } from '$lib/sitemap';
	import { currentRole } from '$lib/stores/auth';
	import { settingsModalOpen } from '$lib/stores/modal';
	import { updateStatusStore } from '$lib/updates';
	import { formatTimestampToNow } from '$lib/utils';

	import { generateNewUrl } from './ButtonNew';
	import ButtonNew from './ButtonNew.svelte';
	import EmptyMessage from './EmptyMessage.svelte';
	import PersonaAvatar from './PersonaAvatar.svelte';
	import SectionList from './SectionList.svelte';
	import SectionListItem from './SectionListItem.svelte';

	type SidebarSection = 'sessions' | 'knowledge';

	let activeSection: SidebarSection = $state('sessions');

	const pathname = $derived(page.url.pathname);
	const isCollapsed = $derived(!$settingsStore.sidebarExpanded);
	// Personas you've talked to, surfaced as launchers atop the session list
	// (unless disabled in settings). Their raw session row is hidden below to
	// avoid duplication.
	const personaLaunchers = $derived(
		$settingsStore.showPinnedPersonas ? conversedPersonas($personasStore, $sessionsStore ?? []) : []
	);
	const launcherSessionIds = $derived(
		personaLaunchers.map((p) => p.sessionId).filter((id): id is string => !!id)
	);
	const visibleSessions = $derived(
		($sessionsStore ?? []).filter((s) => !launcherSessionIds.includes(s.id))
	);

	function toggleExpanded() {
		$settingsStore.sidebarExpanded = !$settingsStore.sidebarExpanded;
	}

	$effect(() => {
		if (pathname.includes('/sessions')) {
			activeSection = 'sessions';
		} else if (pathname.includes('/knowledge') || pathname.includes('/library')) {
			activeSection = 'knowledge';
		}
	});

	function setActiveSection(section: SidebarSection) {
		activeSection = section;
		if (section === 'sessions') {
			goto('/sessions');
		} else if (section === 'knowledge') {
			goto('/library');
		}
	}

	function getInitials(): string {
		const f = $settingsStore.profileFirstName.trim().charAt(0).toUpperCase();
		const l = $settingsStore.profileLastName.trim().charAt(0).toUpperCase();
		return f + l || '?';
	}

	function newHref() {
		return generateNewUrl(activeSection === 'sessions' ? Sitemap.SESSIONS : Sitemap.KNOWLEDGE);
	}
</script>

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
		: 'safe-bottom fixed inset-y-0 left-0 z-30 w-[90vw] max-w-xs lg:relative lg:z-auto lg:w-96 lg:mr-4'}"
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

	<!-- Tab buttons -->
	<div class="flex bg-shade-2 px-3 py-2 text-sm {isCollapsed ? 'flex-col items-center gap-1' : ''}">
		<button
			onclick={() => setActiveSection('sessions')}
			class="duration-25 flex items-center justify-center gap-2 rounded-md px-3 py-2 font-medium transition-colors hover:text-active
				{isCollapsed ? 'w-full' : 'flex-1'}
				{activeSection === 'sessions' && pathname.includes('/sessions')
				? 'bg-shade-0 text-active shadow-sm'
				: activeSection === 'sessions' && !pathname.includes('/sessions')
					? 'bg-shade-1 text-muted shadow-sm'
					: 'text-muted'}"
			role="tab"
			aria-selected={activeSection === 'sessions'}
			aria-controls="sessions-panel"
			title={$LL.sessions()}
		>
			<MessageSquareText class="h-4 w-4 shrink-0" />
			<span class:hidden={isCollapsed}>{$LL.sessions()}</span>
		</button>
		<button
			onclick={() => setActiveSection('knowledge')}
			class="duration-25 flex items-center justify-center gap-2 rounded-md px-3 py-2 font-medium transition-colors hover:text-active
				{isCollapsed ? 'w-full' : 'flex-1'}
				{activeSection === 'knowledge' ? 'bg-shade-0 text-active shadow-sm' : 'text-muted'}"
			role="tab"
			aria-selected={activeSection === 'knowledge'}
			aria-controls="knowledge-panel"
			title="Library"
		>
			<Library class="h-4 w-4 shrink-0" />
			<span class:hidden={isCollapsed}>Library</span>
		</button>
	</div>

	<!-- New button -->
	<div class="border-b bg-shade-2 px-3 pb-3 pt-0">
		{#if isCollapsed}
			<div class="flex justify-center pt-2">
				<a
					href={newHref()}
					class="flex items-center justify-center rounded-lg p-2 text-muted transition-colors hover:text-active"
					aria-label={$LL.newSession()}
					title={$LL.newSession()}
				>
					<Plus class="h-5 w-5" />
				</a>
			</div>
		{:else}
			<ButtonNew sitemap={activeSection === 'sessions' ? Sitemap.SESSIONS : Sitemap.KNOWLEDGE} />
		{/if}
	</div>

	<!-- Collapsed: keep persona launchers reachable as avatars -->
	{#if isCollapsed && personaLaunchers.length > 0}
		<div class="flex flex-col items-center gap-2 border-b py-2.5">
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
		</div>
	{/if}

	<!-- Content area -->
	<div class:hidden={isCollapsed} class="flex min-h-0 flex-1 flex-col overflow-hidden">
		<div class="flex-1 overflow-auto" style="overscroll-behavior-y: contain">
			<section
				id="sessions-panel"
				aria-labelledby="sessions-tab"
				hidden={activeSection !== 'sessions'}
			>
				{#if activeSection === 'sessions'}
					{#if personaLaunchers.length > 0}
						<div
							class="sticky top-0 z-10 border-b bg-shade-1/60 px-2 py-2.5 backdrop-blur-md will-change-transform"
						>
							<p
								class="mb-1.5 text-center text-[11px] font-semibold uppercase tracking-wider text-accent"
							>
								Personas
							</p>
							<div class="flex flex-col gap-0.5">
								{#each personaLaunchers as persona (persona.id)}
									<button
										type="button"
										onclick={() =>
											goto(`/sessions/${launchPersona(persona, $settingsStore.models)}`)}
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
						</div>
					{/if}
					<SectionList>
						{#if visibleSessions.length > 0}
							{#each visibleSessions as session (session.id)}
								<SectionListItem
									sitemap={Sitemap.SESSIONS}
									id={session.id}
									title={getSessionTitle(session)}
									subtitle={formatSessionMetadata(session)}
								/>
							{/each}
						{:else if personaLaunchers.length === 0}
							<EmptyMessage>{$LL.emptySessions()}</EmptyMessage>
						{/if}
					</SectionList>
				{/if}
			</section>
			<section
				id="knowledge-panel"
				aria-labelledby="knowledge-tab"
				hidden={activeSection !== 'knowledge'}
			>
				{#if activeSection === 'knowledge'}
					<SectionList>
						{#if $knowledgeStore && $knowledgeStore.length > 0}
							{#each $knowledgeStore as knowledge (knowledge.id)}
								<SectionListItem
									sitemap={Sitemap.KNOWLEDGE}
									id={knowledge.id}
									title={knowledge.name}
									subtitle={formatTimestampToNow(knowledge.updatedAt)}
								/>
							{/each}
						{:else}
							<EmptyMessage>{$LL.emptyKnowledge()}</EmptyMessage>
						{/if}
					</SectionList>
				{/if}
			</section>
		</div>
	</div>

	<!-- Bottom bar -->
	<div class="mt-auto border-t px-3 py-3">
		<div class="flex items-center justify-between">
			{#if isCollapsed}
				<div class="flex w-full justify-center">
					<button
						onclick={() => ($settingsModalOpen = true)}
						class="duration-25 relative text-muted transition-colors hover:text-active {$updateStatusStore.showSidebarNotification
							? 'after:absolute after:-right-0.5 after:top-0 after:h-2 after:w-2 after:rounded-full after:bg-warning'
							: ''}"
						title={$LL.settings()}
					>
						{#if $settingsStore.profileFirstName || $settingsStore.profileLastName}
							<div
								class="flex h-9 w-9 items-center justify-center rounded-full"
								style="background-color: {$settingsStore.profileColor || '#6366f1'}"
							>
								{#if $settingsStore.profileAvatar}
									<img
										src={$settingsStore.profileAvatar}
										alt="Avatar"
										class="h-9 w-9 rounded-full object-cover"
									/>
								{:else}
									<span class="text-sm font-bold text-shade-0">{getInitials()}</span>
								{/if}
							</div>
						{:else}
							<Settings2 class="h-5 w-5" />
						{/if}
					</button>
				</div>
			{:else}
				{#if $settingsStore.profileFirstName || $settingsStore.profileLastName}
					<div class="flex items-center gap-3">
						<div
							class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
							style="background-color: {$settingsStore.profileColor || '#6366f1'}"
						>
							{#if $settingsStore.profileAvatar}
								<img
									src={$settingsStore.profileAvatar}
									alt="Avatar"
									class="h-9 w-9 rounded-full object-cover"
								/>
							{:else}
								<span class="text-sm font-bold text-shade-0">{getInitials()}</span>
							{/if}
						</div>
						<div class="flex flex-col">
							<span class="truncate text-sm font-medium"
								>{$settingsStore.profileFirstName} {$settingsStore.profileLastName}</span
							>
							<span class="text-xs text-muted"
								>{$currentRole === 'admin' ? 'Administrator' : 'User'}</span
							>
						</div>
					</div>
				{/if}

				<button
					onclick={() => ($settingsModalOpen = true)}
					class="duration-25 relative flex items-center rounded-md p-2 text-muted transition-colors hover:text-active {!$settingsStore.profileFirstName &&
					!$settingsStore.profileLastName
						? 'ml-auto'
						: ''} {$updateStatusStore.showSidebarNotification
						? 'before:absolute before:right-1 before:top-1 before:h-2 before:w-2 before:rounded-full before:bg-warning'
						: ''}"
				>
					<Settings2 class="h-5 w-5" />
				</button>
			{/if}
		</div>
	</div>
</nav>
