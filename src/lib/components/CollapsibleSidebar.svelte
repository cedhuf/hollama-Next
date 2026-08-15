<script lang="ts">
	import { ChevronsRight } from '@lucide/svelte';

	import LL from '$i18n/i18n-svelte';
	import { browser } from '$app/environment';
	import { goto } from '$app/navigation';
	import { personasStore, sessionsStore, settingsStore } from '$lib/localStorage';
	import { conversedPersonas } from '$lib/personas';
	import { watchScrollDirection } from '$lib/scrollDirection';
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

	/** Matches `duration-300` in the actions block. The lock below and the CSS must agree. */
	const TRANSITION_MS = 300;

	/**
	 * The header gives its room back on the way down, and takes it back the moment
	 * you go up, wherever you happen to be. A phone's does the same.
	 *
	 * Direction rather than position, which is what makes it feel answered rather
	 * than triggered: you do not have to return to the top to get the controls back.
	 *
	 * And it is safe here in a way it was not before, because there is no longer a
	 * circuit to close. The actions are a neighbour of the list, not a layer over it,
	 * so no padding stands in for them, nothing measures their height, and nothing
	 * writes the scroll position.
	 */
	let scrolledAway = $state(false);
	const onListScroll = watchScrollDirection((away) => (scrolledAway = away), {
		settle: TRANSITION_MS
	});

	/** The header's shape: the setting, or the way you are going through the list. */
	const compact = $derived($settingsStore.compactSidebarHeader || scrolledAway);

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
	class="fixed inset-y-0 left-0 h-full w-[min(84vw,22rem)] shrink-0 transition-[width,margin] duration-300 ease-out motion-reduce:transition-none lg:relative lg:z-30 lg:max-w-none lg:translate-x-0
		{$settingsStore.sidebarExpanded ? 'lg:mr-4 lg:w-96' : 'lg:mr-2 lg:w-16'}"
	aria-label="Main navigation"
	data-testid="sidebar"
>
	<!-- The column proper, and the only thing that clips. It is a box of its own so
	     that the handle below can sit astride its edge: rounding a corner means
	     cutting off whatever crosses it, and a handle that straddles the edge is
	     exactly that. -->
	<div class="app-panel flex h-full flex-col overflow-hidden lg:rounded-xl lg:border">
		<!-- Laid out at the width it is going to, not at the width it is passing
		     through, in both directions.

		     Nothing inside then moves at all: the column slides over its contents
		     instead of dragging them along. Which is why the mark does not so much as
		     twitch between the two states, centred in sixty four pixels being exactly
		     where it already sits at three hundred and eighty four.

		     It also spares the whole column a reflow per frame. A search field, a pair
		     of tabs and a grid of avatars used to recompute their wrapping sixty times
		     a second on the way between the two widths, which is what made the
		     animation look like boiling rather than opening. -->
		<div
			class="flex h-full w-full flex-col {$settingsStore.sidebarExpanded ? 'lg:w-96' : 'lg:w-16'}"
		>
			<SidebarBrand rail={showRail} onCollapse={collapseOrClose} />

			{#if showRail}
				<SidebarRail personas={personaLaunchers} sessions={visibleSessions} onNewChat={newChat} />
			{:else}
				<SidebarActions bind:query personas={filteredPersonas} {compact} onNewChat={newChat} />
				<SidebarSessions
					sessions={visibleSessions}
					{q}
					{personaById}
					hasPersonaMatches={filteredPersonas.length > 0}
					onScroll={onListScroll}
				/>
			{/if}

			<SidebarFooter rail={showRail} />
		</div>
	</div>

	<!-- Astride the edge, level with the brand. Half of it belongs to the column and
	     half to what is beside it, which is the whole of what it does: it is the seam
	     between the two, not a button the column happens to carry. Hence its position
	     from the header's own height rather than from a number that would have to be
	     kept in step with it. -->
	{#if showRail}
		<button
			onclick={expandSidebar}
			aria-label={$LL.expandSidebar()}
			title={$LL.expandSidebar()}
			style="top: calc(var(--app-header-h) / 2)"
			class="absolute right-0 hidden -translate-y-1/2 translate-x-1/2 items-center justify-center rounded-full border border-shade-3 bg-shade-1 p-1 text-muted shadow-sm transition-colors hover:border-accent hover:text-active lg:flex"
		>
			<ChevronsRight class="h-3.5 w-3.5" />
		</button>
	{/if}
</nav>
