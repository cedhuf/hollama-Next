<script lang="ts">
	import { House, ImageIcon, Library, Plus, Search } from '@lucide/svelte';

	import LL from '$i18n/i18n-svelte';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { canDrawImages } from '$lib/images';
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
	const onHome = $derived(pathname.includes('/sessions'));
</script>

<!-- Sits above the list rather than over it. Nothing scrolls underneath, so this
     pane has no height anyone needs to know and the list needs no clearance: they
     are neighbours in a column, and the column does the arithmetic. -->
<div class="border-shade-3/40 surface-column shrink-0 border-b">
	<!-- Full width for the material, fixed width for the layout: see `SidebarBrand`. -->
	<div class="w-full shrink-0 max-lg:w-[var(--drawer-w)] lg:w-96">
		<div class="flex flex-col px-3 py-3">
			<!-- Two New chat blocks rather than one that moves: a single button would have
		     to cross a flex line break, and a line break is the one thing CSS cannot
		     interpolate, so it happens on a frame, which is the jump. Here the tall one
		     closes on its height while the compact one opens on its width, both
		     continuous, and only ever one of them is reachable.

		     Each is a split control: starting a conversation and drawing a picture are
		     both "make something new", and they share one shape for the same reason the
		     Library's own header buttons share theirs. Two halves of one filled block,
		     divided by a hairline of its own foreground, so it reads as one object with
		     two ends rather than as two buttons that happen to touch. No dropdown: a
		     menu would put a click in front of something used occasionally, which is
		     exactly when a click is most expensive. -->
			<div
				class="bg-accent text-shade-0 flex w-full items-stretch overflow-hidden rounded-lg text-sm font-medium transition-[height,opacity,margin] duration-300 ease-out motion-reduce:transition-none {compact
					? 'pointer-events-none mb-0 h-0 opacity-0'
					: 'mb-2 h-9 opacity-100'}"
				aria-hidden={compact}
			>
				<button
					onclick={onNewChat}
					tabindex={compact ? -1 : 0}
					class="flex min-w-0 flex-1 items-center justify-center gap-2 transition-opacity hover:opacity-90"
				>
					<Plus class="h-4 w-4 shrink-0" />
					{$LL.newChat()}
				</button>

				{#if $canDrawImages}
					<a
						href={resolve('/images')}
						tabindex={compact ? -1 : 0}
						title={$LL.imageGenerate()}
						aria-label={$LL.imageGenerate()}
						class="border-shade-0/25 flex w-9 shrink-0 items-center justify-center border-l transition-opacity hover:opacity-90"
					>
						<ImageIcon class="h-4 w-4" />
					</a>
				{/if}
			</div>

			<div class="flex items-center">
				<div class="relative min-w-0 flex-1">
					<Search
						class="text-muted pointer-events-none absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2"
					/>
					<input
						bind:value={query}
						type="text"
						placeholder={$LL.searchChatsPersonas()}
						class="border-shade-3 bg-shade-0 placeholder:text-muted focus:border-accent w-full rounded-lg border py-2 pr-12 pl-8 text-sm outline-none"
					/>
					<!-- The shortcut opens the full-text dialog, which is a different thing
				     from this field. Shown as a hint, not a button: it is the keyboard's
				     way in, and the line below is the pointer's. -->
					<span
						class="pointer-events-none absolute top-1/2 right-2 flex -translate-y-1/2 items-center gap-0.5"
					>
						<Kbd>{mod}</Kbd><Kbd>K</Kbd>
					</span>
				</div>
				<!-- The same control, folded onto the search row. It opens on its width, so
				     the pair is one box whose width is the sum of its halves: 36 alone, 72
				     with the second. -->
				<div
					aria-hidden={!compact}
					class="bg-accent text-shade-0 flex h-9 shrink-0 items-stretch overflow-hidden rounded-lg transition-[width,opacity,margin] duration-300 ease-out motion-reduce:transition-none {compact
						? $canDrawImages
							? 'ml-2 w-[4.5rem] opacity-100'
							: 'ml-2 w-9 opacity-100'
						: 'pointer-events-none ml-0 w-0 opacity-0'}"
				>
					<button
						onclick={onNewChat}
						title={$LL.newChat()}
						aria-label={$LL.newChat()}
						tabindex={compact ? 0 : -1}
						class="flex w-9 shrink-0 items-center justify-center transition-opacity hover:opacity-90"
					>
						<Plus class="h-4 w-4 shrink-0" />
					</button>

					{#if $canDrawImages}
						<a
							href={resolve('/images')}
							title={$LL.imageGenerate()}
							aria-label={$LL.imageGenerate()}
							tabindex={compact ? 0 : -1}
							class="border-shade-0/25 flex w-9 shrink-0 items-center justify-center border-l transition-opacity hover:opacity-90"
						>
							<ImageIcon class="h-4 w-4" />
						</a>
					{/if}
				</div>
			</div>

			<!-- The field above filters titles; this is the way out to the content of
		     every conversation. Offered rather than configured: the choice belongs to
		     the moment, not to a setting. -->
			{#if q}
				<button
					type="button"
					onclick={() => openSearch(query)}
					class="border-shade-3 text-muted hover:bg-shade-0 hover:text-active mt-2 flex w-full items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-sm transition-colors"
				>
					<Search class="h-4 w-4 shrink-0" />
					<span class="truncate">{$LL.searchAllConversations({ query })}</span>
				</button>
			{/if}

			<div class="mt-2 flex w-full gap-1.5">
				<a
					href={resolve('/sessions')}
					title={$LL.home()}
					class="flex min-w-0 flex-1 items-center justify-center gap-2 rounded-lg px-2 py-2 text-sm font-medium transition-colors {onHome
						? 'bg-shade-0 text-active shadow-sm'
						: 'text-muted hover:bg-shade-0 hover:text-active'}"
				>
					<House class="h-4 w-4 shrink-0" />
					<span class="truncate">{$LL.home()}</span>
				</a>
				<a
					href={resolve('/library')}
					title={$LL.library()}
					class="flex min-w-0 flex-1 items-center justify-center gap-2 rounded-lg px-2 py-2 text-sm font-medium transition-colors {onLibrary
						? 'bg-shade-0 text-active shadow-sm'
						: 'text-muted hover:bg-shade-0 hover:text-active'}"
				>
					<Library class="h-4 w-4 shrink-0" />
					<span class="truncate">{$LL.library()}</span>
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
			class="grid transition-[grid-template-rows,opacity] duration-300 ease-out motion-reduce:transition-none {compact
				? 'grid-rows-[0fr] opacity-0'
				: 'grid-rows-[1fr] opacity-100'}"
		>
			<div class="min-h-0 overflow-hidden">
				<SidebarPersonas {personas} shape="grid" forceOpen={!!q} />
			</div>
		</div>

		<div
			class="overflow-hidden transition-[height,opacity] duration-300 ease-out motion-reduce:transition-none {compact &&
			personas.length > 0
				? 'h-11 opacity-100'
				: 'h-0 opacity-0'}"
		>
			<SidebarPersonas {personas} shape="strip" />
		</div>
	</div>
</div>
