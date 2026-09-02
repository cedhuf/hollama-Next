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
	 * The header gives its room back on the way down and takes it back the moment
	 * you go up, wherever you are. Direction rather than position, which is what
	 * makes it feel answered rather than triggered.
	 *
	 * Safe here in a way it was not before: the actions are a neighbour of the list
	 * rather than a layer over it, so no padding stands in for them, nothing
	 * measures their height, and nothing writes the scroll position.
	 */
	let scrolledAway = $state(false);
	const onListScroll = watchScrollDirection((away) => (scrolledAway = away), {
		settle: TRANSITION_MS
	});

	/** The header's shape: the setting, or the way you are going through the list. */
	const compact = $derived($settingsStore.compactSidebarHeader || scrolledAway);

	// Personas you have talked to, above the list unless disabled. Their raw session
	// row is dropped to avoid showing them twice.
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
	// A persona's conversation is not obviously one when its launcher is off: it
	// lands among the others with nothing to tell it apart, and its avatar is what
	// says so.
	const personaById = $derived(
		Object.fromEntries(($personasStore ?? []).map((persona) => [persona.id, persona]))
	);

	// The mobile drawer is transient and starts closed; the desktop rail is the
	// persisted `sidebarExpanded`. Separate, so the drawer never persists and the
	// two modes do not fight over one boolean.
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

<!-- The drawer is pinned to the viewport, so it spans the display top to bottom.
     Only the side is its own business, in landscape where the sensor housing eats
     into one edge; the top and bottom belong to the brand and the footer.

     Four blocks in the order they are read, as neighbours in a column rather
     than layers, so what shows through them is whatever the column stands on.

     The column paints nothing and blurs everything: a colour here would stand
     between the materials and the wallpaper, and the blur has to be here rather
     than on each block, or two stacked surfaces filter their own share of the
     backdrop and leave a seam.

     Mobile: a fixed drawer pinned under the page, which the page slides aside to
     uncover. Desktop: an in-flow rail or full column. -->
<nav
	class="fixed inset-y-0 left-0 h-full w-full shrink-0 transition-[width] duration-300 ease-out motion-reduce:transition-none max-lg:pl-[var(--safe-left)] lg:relative lg:z-30 lg:mr-4 lg:max-w-none lg:translate-x-0
		{$settingsStore.sidebarExpanded ? 'lg:w-96' : 'lg:w-16'}"
	aria-label="Main navigation"
	data-testid="sidebar"
>
	<!-- The column proper, and the only thing that clips. Its own box so the handle
	     below can sit astride its edge: rounding a corner cuts off whatever crosses
	     it.

	     It carries the column's material as well as its frame. The blocks inside are
	     laid out at the width the column is going to, so while it narrows there is a
	     strip between them and the border: painted, that strip is the column still
	     closing; bare, it was a lit window showing the wallpaper straight through. -->
	<div class="app-panel flex h-full overflow-hidden lg:rounded-xl lg:border">
		<!-- The blocks fill this, each holding its contents at the width the column is
		     going to.

		     The split is theirs rather than this box's. Pin a whole column at its target
		     width and the frame keeps animating around it, leaving a strip nothing
		     paints. Let the column follow the frame instead and everything inside
		     re-wraps sixty times a second, which looked like boiling rather than
		     opening. Separated, each block paints out to the edge at every frame while
		     its contents stay put. -->
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

	<!-- Astride the edge, level with the brand: half belongs to the column and half
	     to what is beside it, which is the whole of what it does. Its position comes
	     from the header's own height rather than a number kept in step with it. -->
	{#if showRail}
		<button
			onclick={expandSidebar}
			aria-label={$LL.expandSidebar()}
			title={$LL.expandSidebar()}
			style="top: calc(var(--app-header-h) / 2)"
			class="border-shade-3 bg-shade-1 text-muted hover:border-accent hover:text-active absolute right-0 hidden translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border p-1 shadow-sm transition-colors lg:flex"
		>
			<ChevronsRight class="h-3.5 w-3.5" />
		</button>
	{/if}
</nav>
