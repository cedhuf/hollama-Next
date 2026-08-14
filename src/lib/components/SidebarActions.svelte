<script lang="ts">
	import { Library, MessageSquareText, Plus, Search } from '@lucide/svelte';

	import LL from '$i18n/i18n-svelte';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import type { Persona } from '$lib/personas';
	import { modKey } from '$lib/platform';
	import { openSearch } from '$lib/stores/modal';

	import Kbd from './Kbd.svelte';
	import SidebarPersonas from './SidebarPersonas.svelte';

	interface Props {
		query: string;
		personas: Persona[];
		/**
		 * The compact header, chosen in settings and nowhere else.
		 *
		 * One shape or the other, decided once: New chat sits on the search row
		 * rather than above it, and the personas are a row of avatars rather than a
		 * named grid. Nothing here reacts to the scroll, so this pane keeps the same
		 * height for as long as the setting does.
		 */
		compact: boolean;
		onNewChat: () => void;
	}

	let { query = $bindable(''), personas, compact, onNewChat }: Props = $props();

	const q = $derived(query.trim().toLowerCase());
	const mod = $derived(modKey());
	const pathname = $derived(page.url.pathname);
	const onLibrary = $derived(pathname.includes('/library') || pathname.includes('/knowledge'));
	const onChats = $derived(pathname.includes('/sessions'));
</script>

<!-- Sits above the list rather than over it. Nothing scrolls underneath, so this
     pane has no height anyone needs to know and the list needs no clearance: they
     are neighbours in a column, and the column does the arithmetic. -->
<div class="shrink-0 border-b border-shade-3/40 surface-pane">
	<div class="flex flex-col px-3 py-3">
		{#if !compact}
			<button
				onclick={onNewChat}
				class="mb-2 flex h-9 w-full items-center justify-center gap-2 rounded-lg bg-accent text-sm font-medium text-shade-0 transition-opacity hover:opacity-90"
			>
				<Plus class="h-4 w-4 shrink-0" />
				{$LL.newChat()}
			</button>
		{/if}

		<div class="flex items-center">
			<div class="relative min-w-0 flex-1">
				<Search
					class="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
				/>
				<input
					bind:value={query}
					type="text"
					placeholder={$LL.searchChatsPersonas()}
					class="w-full rounded-lg border border-shade-3 bg-shade-0 py-2 pl-8 pr-12 text-sm outline-none placeholder:text-muted focus:border-accent"
				/>
				<!-- The shortcut opens the full-text dialog, which is a different thing
				     from this field. Shown as a hint, not a button: it is the keyboard's
				     way in, and the line below is the pointer's. -->
				<span
					class="pointer-events-none absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-0.5"
				>
					<Kbd>{mod}</Kbd><Kbd>K</Kbd>
				</span>
			</div>
			{#if compact}
				<button
					onclick={onNewChat}
					title={$LL.newChat()}
					aria-label={$LL.newChat()}
					class="ml-2 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent text-shade-0 transition-opacity hover:opacity-90"
				>
					<Plus class="h-4 w-4 shrink-0" />
				</button>
			{/if}
		</div>

		<!-- The field above filters titles; this is the way out to the content of
		     every conversation. Offered rather than configured: the choice belongs to
		     the moment, not to a setting. -->
		{#if q}
			<button
				type="button"
				onclick={() => openSearch(query)}
				class="mt-2 flex w-full items-center gap-2 rounded-lg border border-shade-3 px-2.5 py-2 text-left text-sm text-muted transition-colors hover:bg-shade-0 hover:text-active"
			>
				<Search class="h-4 w-4 shrink-0" />
				<span class="truncate">{$LL.searchAllConversations({ query })}</span>
			</button>
		{/if}

		<div class="mt-2 flex w-full gap-1.5">
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

	<!-- Pinned means pinned. Whatever shape the header is in, the launchers hold
	     their place above the list and are never scrolled out of reach; only their
	     size changes.

	     Both shapes are drawn, each folding on its own axis, because a swap cannot be
	     animated and an unannounced hundred-pixel jump in the list is worse than
	     seeing them overlap for a fifth of a second. The grid folds on grid rows,
	     which needs no height to be known; the strip opens on a height it has by
	     construction. -->
	<div
		class="grid transition-[grid-template-rows,opacity] duration-200 motion-reduce:transition-none {compact
			? 'grid-rows-[0fr] opacity-0'
			: 'grid-rows-[1fr] opacity-100'}"
	>
		<div class="min-h-0 overflow-hidden">
			<SidebarPersonas {personas} shape="grid" forceOpen={!!q} />
		</div>
	</div>

	<div
		class="overflow-hidden transition-[height,opacity] duration-200 motion-reduce:transition-none {compact &&
		personas.length > 0
			? 'h-11 opacity-100'
			: 'h-0 opacity-0'}"
	>
		<SidebarPersonas {personas} shape="strip" />
	</div>
</div>
