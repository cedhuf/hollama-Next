<script lang="ts">
	import { Pin, Trash2 } from '@lucide/svelte';
	import type { Snippet } from 'svelte';

	import LL from '$i18n/i18n-svelte';
	import { page } from '$app/state';
	import { settingsStore } from '$lib/localStorage';
	import { toggleSessionPin } from '$lib/sessions';
	import { Sitemap } from '$lib/sitemap';

	import ButtonDelete from './ButtonDelete.svelte';
	import { generateNewUrl } from './ButtonNew';
	import ContextMenu from './ContextMenu.svelte';
	import MenuItem from './MenuItem.svelte';
	import SessionMenu from './SessionMenu.svelte';

	interface Props {
		sitemap: Sitemap;
		id: string;
		title: string;
		subtitle: string;
		pinned?: boolean;
		/** Drawn before the title. A persona's conversation carries its avatar here. */
		leading?: Snippet;
	}

	let { sitemap, id, title, subtitle, pinned = false, leading }: Props = $props();
	let isDeleting = $state(false);

	const isSession = $derived(sitemap === Sitemap.SESSIONS);
	const isActive = $derived(page.url.pathname.includes(id));

	/**
	 * The buttons that sit on the row itself, off by default.
	 *
	 * Everything they do is in the right-click menu, which does not hover over the
	 * title, does not truncate it further on a narrow sidebar, and does not put
	 * delete one slip away from the conversation you meant to open. Turned on for
	 * anyone who would rather have them one click closer.
	 */
	const showQuickActions = $derived($settingsStore.showListQuickActions === true);
</script>

<!-- Need to use `#key id` to re-render the delete nav after deletion -->
{#key id}
	<ContextMenu>
		{#snippet trigger({ props })}
			<div
				{...props}
				class="section-list-item group hover:bg-shade-0 relative flex items-center rounded-lg px-2.5 transition-colors
				{isActive ? 'bg-shade-0' : ''}"
				class:confirm-deletion={isDeleting}
			>
				{#if leading}
					<span class="mr-2 shrink-0">{@render leading()}</span>
				{/if}
				<a
					class="relative z-0 min-w-0 flex-1 py-2 {isActive ? 'text-active' : 'hover:text-active'}"
					data-testid={isSession ? 'session-item' : 'knowledge-item'}
					href={generateNewUrl(sitemap, id)}
				>
					<p class="truncate text-sm font-medium {isActive ? 'text-active' : ''}">{title}</p>
					<p class="text-muted truncate text-xs">{subtitle}</p>
				</a>

				<!-- In the flow rather than over the title.

				     Overlaying them meant painting a plate underneath so the title did
				     not read through the icons, and that plate is every complaint at
				     once: a rectangle in a different colour from the row it sits on, a
				     left padding that put the lone pin off centre inside it, and the
				     look of a button where an icon was wanted. Here the row makes room
				     for them instead, so there is nothing to mask and nothing to draw.

				     They keep their room while invisible, so a title does not change
				     length under the pointer. -->
				{#if isSession && !isDeleting && (pinned || showQuickActions)}
					<button
						type="button"
						onclick={() => void toggleSessionPin(id)}
						title={pinned ? $LL.unpin() : $LL.pin()}
						aria-label={pinned ? $LL.unpin() : $LL.pin()}
						class="shrink-0 px-1.5 py-1 transition-[color,opacity] {pinned
							? 'text-accent'
							: 'text-muted hover:text-active opacity-0 group-hover:opacity-100 focus-visible:opacity-100'}"
					>
						<Pin class="base-icon {pinned ? 'fill-accent' : ''}" />
					</button>
				{/if}

				<!-- Shown while a deletion is waiting to be confirmed whatever the
				     setting says: the confirmation has to appear where the row is,
				     including when the deletion was asked for from the right-click
				     menu. -->
				{#if showQuickActions || isDeleting}
					<div
						class="flex shrink-0 items-center {isDeleting
							? ''
							: 'opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100'}"
					>
						<ButtonDelete {sitemap} {id} compact bind:shouldConfirmDeletion={isDeleting} />
					</div>
				{/if}
			</div>
		{/snippet}

		{#if isSession}
			<SessionMenu {id} {pinned} onDelete={() => (isDeleting = true)} />
		{:else}
			<!-- Asks rather than does: the confirmation appears on the row, in the same
			     place it appears when the quick buttons are on. -->
			<MenuItem icon={Trash2} danger onclick={() => (isDeleting = true)}>
				{$LL.deleteKnowledge()}
			</MenuItem>
		{/if}
	</ContextMenu>
{/key}

<style>
	/* iOS answers a long press on a link with its own preview sheet, and on text
	   with the selection magnifier. Either one swallows the press before the
	   context menu can open, which is why the menu worked everywhere except the
	   installed app. Both properties inherit, so the row covers its title and its
	   link at once. Nothing is lost: a sidebar row is a target, not a passage. */
	.section-list-item {
		-webkit-touch-callout: none;
		-webkit-user-select: none;
		user-select: none;
	}
</style>
