<script lang="ts">
	import { browser } from '$app/environment';
	import { goto } from '$app/navigation';
	import { personasStore, sessionsStore, settingsStore } from '$lib/localStorage';
	import { conversedPersonas } from '$lib/personas';
	import { Sitemap } from '$lib/sitemap';
	import { mobileDrawerOpen } from '$lib/stores/sidebar';

	import { generateNewUrl } from './ButtonNew';
	import SidebarActions from './SidebarActions.svelte';
	import SidebarBrand from './SidebarBrand.svelte';
	import SidebarFooter from './SidebarFooter.svelte';
	import SidebarRail from './SidebarRail.svelte';
	import SidebarSessions from './SidebarSessions.svelte';

	let query = $state('');

	const q = $derived(query.trim().toLowerCase());

	/** The header's shape, chosen in settings and nowhere else. */
	const compact = $derived($settingsStore.compactSidebarHeader);

	// Personas you've talked to, surfaced above the list unless disabled in
	// settings. Their raw session row is dropped to avoid showing them twice.
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
	// A persona's conversation is not obviously one when its launcher is turned
	// off: it lands among the others with nothing to tell it apart. Its avatar is
	// the thing that says so.
	const personaById = $derived(
		Object.fromEntries(($personasStore ?? []).map((persona) => [persona.id, persona]))
	);
	const recentSessions = $derived(visibleSessions.slice(0, 4));

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
</script>

<!-- Four blocks, in the order they are read: the brand, the actions, the list, the
     footer. Four neighbours in a column, not layers over one another, which is what
     makes the rest of it fall away: only the list scrolls, so the scrollbar is the
     list's own; nothing passes under anything, so no height has to be measured and
     no padding has to stand in for a pane. Each block carries its own material, and
     what shows through them is whatever the column is standing on.

     The column paints nothing and blurs everything, on purpose. A colour here would
     be the one thing standing between the materials and the wallpaper; and the blur
     has to be here rather than on each block, because two stacked surfaces filter
     their own share of the backdrop and leave a seam where they meet.

     Mobile: a fixed, stationary drawer pinned under the page (iOS reveal), where
     the page slides aside to uncover it and the sidebar itself never moves.
     Desktop: an in-flow rail/full column driven by the persisted sidebarExpanded. -->
<nav
	class="app-panel fixed inset-y-0 left-0 flex h-full w-[min(84vw,22rem)] shrink-0 flex-col overflow-hidden transition-[width] duration-200 ease-in-out lg:relative lg:z-auto lg:max-w-none lg:translate-x-0 lg:rounded-xl lg:border
		{$settingsStore.sidebarExpanded ? 'lg:mr-4 lg:w-96' : 'lg:mr-2 lg:w-16'}"
	aria-label="Main navigation"
	data-testid="sidebar"
>
	<SidebarBrand rail={showRail} onExpand={expandSidebar} onCollapse={collapseOrClose} />

	{#if showRail}
		<SidebarRail personas={personaLaunchers} sessions={recentSessions} onNewChat={newChat} />
	{:else}
		<SidebarActions bind:query personas={filteredPersonas} {compact} onNewChat={newChat} />
		<SidebarSessions
			sessions={visibleSessions}
			{q}
			{personaById}
			hasPersonaMatches={filteredPersonas.length > 0}
		/>
	{/if}

	<SidebarFooter rail={showRail} />
</nav>
