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

<!-- The drawer is pinned to the viewport, so it spans the display top to bottom like
     the card beside it. Only the side is its own business here, in landscape, where
     the sensor housing eats into one edge; the top and the bottom belong to the brand
     and to the footer, being the two blocks that touch them.

     Four blocks, in the order they are read: the brand, the actions, the list, the
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
	class="fixed inset-y-0 left-0 h-full w-full shrink-0 transition-[width] duration-300 ease-out motion-reduce:transition-none max-lg:pl-[env(safe-area-inset-left)] lg:relative lg:z-30 lg:mr-4 lg:max-w-none lg:translate-x-0
		{$settingsStore.sidebarExpanded ? 'lg:w-96' : 'lg:w-16'}"
	aria-label="Main navigation"
	data-testid="sidebar"
>
	<!-- The column proper, and the only thing that clips. It is a box of its own so
	     that the handle below can sit astride its edge: rounding a corner means
	     cutting off whatever crosses it, and a handle that straddles the edge is
	     exactly that.

	     It carries the column's material as well as its frame, which matters for one
	     third of a second and looks broken without it. The blocks inside are laid out
	     at the width the column is going to, not the one it is passing through, so
	     while it narrows there is a strip between them and the border. Painted, that
	     strip is the column still closing. Left bare, it was a lit window in a shrinking
	     frame, showing the wallpaper straight through. -->
	<div class="app-panel flex h-full overflow-hidden lg:rounded-xl lg:border">
		<!-- The blocks fill this, and each one holds its own contents at the width the
		     column is going to.

		     The split is theirs rather than this box's, and it took three attempts to
		     see why. Pin a whole column at its target width and the frame keeps
		     animating around it, leaving a strip that nothing paints: a lit window on
		     the wallpaper, and no single material can fill it, since the right one at
		     any height is whichever block is there. Let the column follow the frame
		     instead and everything inside re-wraps sixty times a second, which is what
		     made this look like boiling rather than opening.

		     Separated, each block paints out to the edge at every frame while its
		     contents stay put. Nothing moves, nothing is left bare, and no third layer
		     was needed to hide either. -->
		<div class="flex h-full w-full flex-col">
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
