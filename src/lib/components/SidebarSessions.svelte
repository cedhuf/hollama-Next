<script lang="ts">
	import { Archive } from '@lucide/svelte';

	import LL from '$i18n/i18n-svelte';
	import { serversStore } from '$lib/localStorage';
	import type { Persona } from '$lib/personas';
	import type { ScrollDirectionWatcher } from '$lib/scrollDirection';
	import {
		formatSessionMetadata,
		groupSessions,
		resolveSessionTitle,
		type SessionGroupKey,
		type SessionSummary
	} from '$lib/sessions';
	import { Sitemap } from '$lib/sitemap';

	import ArchiveModal from './ArchiveModal.svelte';
	import EmptyMessage from './EmptyMessage.svelte';
	import PersonaAvatar from './PersonaAvatar.svelte';
	import SectionListItem from './SectionListItem.svelte';

	interface Props {
		sessions: SessionSummary[];
		/** Lower-cased search terms, or empty. Filters titles in place. */
		q: string;
		/** A persona's conversation carries its avatar, so it is recognisable as one. */
		personaById: Record<string, Persona>;
		/** Whether the header still has a match to show, for the empty state. */
		hasPersonaMatches: boolean;
		/** Reports the scroller itself, once per frame. The header decides what to do with it. */
		onScroll?: ScrollDirectionWatcher;
	}

	let { sessions, q, personaById, hasPersonaMatches, onScroll }: Props = $props();

	// Collapsing the column takes this list with it, and expanding builds another
	// one, at the top. The watcher outlives both, so it is told here, where the new
	// scroller appears, that nothing it remembers describes this one. Otherwise the
	// column comes back folded over a list nobody has scrolled, and the fold has to
	// be undone by hand, down and back up.
	$effect(() => {
		onScroll?.reset();
	});

	// Scroll fires far more often than the screen refreshes, so the read waits for
	// the next frame.
	let el: HTMLDivElement | undefined = $state();
	let queued = false;
	function handleScroll() {
		if (!onScroll || queued) return;
		queued = true;
		requestAnimationFrame(() => {
			queued = false;
			if (el) onScroll?.(el);
		});
	}

	let archiveOpen = $state(false);
	const archivedCount = $derived(sessions.filter((s) => s.archived).length);

	const filtered = $derived(
		q ? sessions.filter((s) => resolveSessionTitle(s).toLowerCase().includes(q)) : sessions
	);
	const groups = $derived(groupSessions(filtered));

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
</script>

<!-- Between the panes rather than under them, which is the whole of it: nothing
     passes beneath anything, so no clearance has to be measured, no padding stands
     in for a pane, and the scrollbar belongs to this box alone instead of running
     the height of the column. What the translucency reveals is the wallpaper, which
     is the only thing behind the column worth revealing. -->
<div
	bind:this={el}
	onscroll={handleScroll}
	class="surface-column min-h-0 flex-1 overflow-y-auto"
	style="overscroll-behavior-y: contain; overflow-x: hidden"
>
	<!-- Full width for the material, fixed width for the layout: see `SidebarBrand`.
	     Sideways overflow is hidden rather than scrolled, since while the column
	     narrows this box is wider than what holds it and a scrollbar would appear for
	     the length of the animation. -->
	<div class="w-full px-2 py-2 max-lg:w-[var(--drawer-w)] lg:w-96">
		{#each groups as group (group.key)}
			<div class="mb-2">
				<p class="text-muted px-2 py-1 text-[11px] font-semibold tracking-wider uppercase">
					{groupLabel(group.key)}
				</p>
				<!-- A hair of space between rows: hovering the neighbour of the active
			     session used to butt two rounded highlights against each other. -->
				<div class="flex flex-col gap-0.5">
					{#each group.sessions as session (session.id)}
						{@const persona = session.personaId ? personaById[session.personaId] : undefined}
						<SectionListItem
							sitemap={Sitemap.SESSIONS}
							id={session.id}
							title={resolveSessionTitle(session)}
							subtitle={formatSessionMetadata(session, $serversStore)}
							pinned={session.pinned}
							leading={persona ? personaBadge : undefined}
						/>
						{#snippet personaBadge()}
							{#if persona}
								<PersonaAvatar {persona} size={24} />
							{/if}
						{/snippet}
					{/each}
				</div>
			</div>
		{/each}

		{#if groups.length === 0 && !hasPersonaMatches}
			<EmptyMessage>{q ? $LL.noMatches() : $LL.emptySessions()}</EmptyMessage>
		{/if}

		<!-- At the foot of the list, because that is where you are once you have
		     scrolled past everything you actually have. Quiet, and absent entirely
		     when there is nothing in it: a permanent link to an empty room is a
		     control that teaches nothing. -->
		{#if archivedCount > 0 && !q}
			<button
				type="button"
				onclick={() => (archiveOpen = true)}
				class="text-muted hover:bg-shade-0 hover:text-active mt-1 flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs transition-colors"
			>
				<Archive class="h-3.5 w-3.5 shrink-0" />
				<span class="truncate">{$LL.archivedSessions()}</span>
				<span class="ml-auto shrink-0">{archivedCount}</span>
			</button>
		{/if}
	</div>
</div>

<ArchiveModal bind:open={archiveOpen} />
