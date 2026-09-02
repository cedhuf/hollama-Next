<script lang="ts">
	import { Pin, Trash2 } from '@lucide/svelte';
	import type { Snippet } from 'svelte';

	import LL from '$i18n/i18n-svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { knowledgeStore, sessionsStore, settingsStore } from '$lib/localStorage';
	import { unbindPersonaSession } from '$lib/personas';
	import { toggleSessionPin } from '$lib/sessions';
	import { Sitemap } from '$lib/sitemap';

	import ButtonConfirm from './ButtonConfirm.svelte';
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

	/** Here rather than inside the button: a button that reaches into the stores can only delete the kinds somebody remembered to write into its switch. The row already knows what it is listing. */
	function remove() {
		if (sitemap === Sitemap.KNOWLEDGE) {
			knowledgeStore.remove(id);
			return;
		}
		sessionsStore.remove(id);
		unbindPersonaSession(id);
		void goto(resolve('/sessions'));
	}
	const isActive = $derived(page.url.pathname.includes(id));

	/** Everything they do is in the right-click menu, which does not hover over the title, does not truncate it further, and does not put delete one slip away from the conversation you meant to open. */
	const showQuickActions = $derived($settingsStore.showListQuickActions === true);
</script>

<!-- `#key id` re-renders the delete nav after a deletion. -->
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

				     Overlaying them meant painting a plate underneath so the title did not read
				     through the icons, and that plate was a rectangle in a different colour from
				     its row, with a padding that put the lone pin off centre. Here the row makes
				     room instead, so there is nothing to mask. -->
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

				<!-- Shown while a deletion waits to be confirmed whatever the setting says: the
				     confirmation has to appear where the row is, including when it was asked for
				     from the right-click menu. -->
				{#if showQuickActions || isDeleting}
					<div
						class="flex shrink-0 items-center {isDeleting
							? ''
							: 'opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100'}"
					>
						<ButtonConfirm
							compact
							bind:armed={isDeleting}
							onConfirm={remove}
							label={sitemap === Sitemap.KNOWLEDGE ? $LL.deleteKnowledge() : $LL.deleteSession()}
						/>
					</div>
				{/if}
			</div>
		{/snippet}

		{#if isSession}
			<SessionMenu {id} {pinned} onDelete={() => (isDeleting = true)} />
		{:else}
			<!-- Asks rather than does: the confirmation appears on the row, where it appears
			     when the quick buttons are on. -->
			<MenuItem icon={Trash2} danger onclick={() => (isDeleting = true)}>
				{$LL.deleteKnowledge()}
			</MenuItem>
		{/if}
	</ContextMenu>
{/key}

<style>
	/* iOS answers a long press on a link with its own preview sheet, and on text
	   with the selection magnifier, and either swallows the press before the context
	   menu opens. Both properties inherit, so the row covers its title and its link
	   at once: a sidebar row is a target, not a passage. */
	.section-list-item {
		-webkit-touch-callout: none;
		-webkit-user-select: none;
		user-select: none;
	}
</style>
