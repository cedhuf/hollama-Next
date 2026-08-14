<script lang="ts">
	import LL from '$i18n/i18n-svelte';
	import { serversStore } from '$lib/localStorage';
	import type { Persona } from '$lib/personas';
	import {
		formatSessionMetadata,
		groupSessions,
		resolveSessionTitle,
		type SessionGroupKey,
		type SessionSummary
	} from '$lib/sessions';
	import { Sitemap } from '$lib/sitemap';

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
		/** Reports the scroll position, once per frame. The header decides what to do with it. */
		onScroll?: (top: number) => void;
	}

	let { sessions, q, personaById, hasPersonaMatches, onScroll }: Props = $props();

	// Scroll fires far more often than the screen refreshes, so the read waits for
	// the next frame.
	let el: HTMLDivElement | undefined = $state();
	let queued = false;
	function handleScroll() {
		if (!onScroll || queued) return;
		queued = true;
		requestAnimationFrame(() => {
			queued = false;
			onScroll?.(el?.scrollTop ?? 0);
		});
	}

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
	class="min-h-0 flex-1 overflow-auto px-2 py-2 surface-pane"
	style="overscroll-behavior-y: contain"
>
	{#each groups as group (group.key)}
		<div class="mb-2">
			<p class="px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-muted">
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
</div>
