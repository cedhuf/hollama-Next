<script lang="ts">
	import { Pin } from '@lucide/svelte';

	import { page } from '$app/state';
	import { toggleSessionPin } from '$lib/sessions';
	import { Sitemap } from '$lib/sitemap';

	import ButtonDelete from './ButtonDelete.svelte';

	interface Props {
		sitemap: Sitemap;
		id: string;
		title: string;
		subtitle: string;
		pinned?: boolean;
	}

	let { sitemap, id, title, subtitle, pinned = false }: Props = $props();
	let isDeleting = $state(false);

	const isSession = $derived(sitemap === Sitemap.SESSIONS);
	const isActive = $derived(page.url.pathname.includes(id));
</script>

<!-- Need to use `#key id` to re-render the delete nav after deletion -->
{#key id}
	<div
		class="section-list-item group relative flex items-center rounded-lg px-2.5 transition-colors hover:bg-shade-0
			{isActive ? 'bg-shade-0' : ''}"
		class:confirm-deletion={isDeleting}
	>
		<a
			class="relative z-0 min-w-0 flex-1 py-2 {isActive ? 'text-active' : 'hover:text-active'}"
			data-testid={isSession ? 'session-item' : 'knowledge-item'}
			href={`/${sitemap}/${id}`}
		>
			<p class="truncate text-sm font-medium {isActive ? 'text-active' : ''}">{title}</p>
			<p class="truncate text-xs text-muted">{subtitle}</p>
		</a>

		<!-- Hover actions, overlaid on the right so they don't shift the title -->
		<nav
			class="absolute right-1.5 top-1/2 flex -translate-y-1/2 items-center gap-0.5 rounded-md bg-shade-0 pl-1 opacity-0 transition-opacity group-hover:opacity-100
				{isDeleting || pinned ? 'opacity-100' : ''}"
		>
			{#if isSession && !isDeleting}
				<button
					type="button"
					onclick={() => toggleSessionPin(id)}
					title={pinned ? 'Unpin' : 'Pin'}
					aria-label={pinned ? 'Unpin' : 'Pin'}
					class="rounded p-1 text-muted transition-colors hover:text-active {pinned
						? 'text-accent hover:text-accent'
						: ''}"
				>
					<Pin class="h-3.5 w-3.5 {pinned ? 'fill-accent' : ''}" />
				</button>
			{/if}
			<ButtonDelete {sitemap} {id} bind:shouldConfirmDeletion={isDeleting} />
		</nav>
	</div>
{/key}
