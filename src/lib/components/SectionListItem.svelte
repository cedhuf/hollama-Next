<script lang="ts">
	import { Braces, Brain, FileText, Pin, PinOff, Trash2 } from '@lucide/svelte';

	import LL from '$i18n/i18n-svelte';
	import { page } from '$app/state';
	import { copyText } from '$lib/clipboard';
	import { repository } from '$lib/data';
	import { settingsStore } from '$lib/localStorage';
	import { serializeSession, sessionAsKnowledgeDraft, type ExportFormat } from '$lib/sessionExport';
	import { toggleSessionPin } from '$lib/sessions';
	import { Sitemap } from '$lib/sitemap';
	import { openKnowledge } from '$lib/stores/modal';

	import ButtonDelete from './ButtonDelete.svelte';
	import { generateNewUrl } from './ButtonNew';
	import ContextMenu from './ContextMenu.svelte';
	import MenuItem from './MenuItem.svelte';

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

	/**
	 * The buttons that sit on the row itself, off by default.
	 *
	 * Everything they do is in the right-click menu, which does not hover over the
	 * title, does not truncate it further on a narrow sidebar, and does not put
	 * delete one slip away from the conversation you meant to open. Turned on for
	 * anyone who would rather have them one click closer.
	 */
	const showQuickActions = $derived($settingsStore.showListQuickActions === true);

	/**
	 * Offer the transcript, don't file it.
	 *
	 * The editor opens with the conversation already in it, so the collection can
	 * be named and trimmed before it exists. Writing it straight to the library
	 * left people with an item called after the conversation, holding everything
	 * that was ever said in it, which is rarely what they wanted to keep.
	 */
	async function saveAsKnowledge() {
		const draft = await sessionAsKnowledgeDraft(id);
		if (draft) openKnowledge(draft);
	}

	async function copyAs(format: ExportFormat) {
		const session = await repository.loadSession(id);
		if (session) await copyText(serializeSession(session, format));
	}
</script>

<!-- Need to use `#key id` to re-render the delete nav after deletion -->
{#key id}
	<ContextMenu>
		{#snippet trigger({ props })}
			<div
				{...props}
				class="section-list-item group relative flex items-center rounded-lg px-2.5 transition-colors hover:bg-shade-0
				{isActive ? 'bg-shade-0' : ''}"
				class:confirm-deletion={isDeleting}
			>
				<a
					class="relative z-0 min-w-0 flex-1 py-2 {isActive ? 'text-active' : 'hover:text-active'}"
					data-testid={isSession ? 'session-item' : 'knowledge-item'}
					href={generateNewUrl(sitemap, id)}
				>
					<p class="truncate text-sm font-medium {isActive ? 'text-active' : ''}">{title}</p>
					<p class="truncate text-xs text-muted">{subtitle}</p>
				</a>

				<!-- Overlaid on the right so they don't shift the title. Shown while a
				     deletion is waiting to be confirmed whatever the setting says: the
				     confirmation has to appear where the row is, including when the
				     deletion was asked for from the right-click menu. -->
				{#if showQuickActions || isDeleting || pinned}
					<nav
						class="absolute right-1.5 top-1/2 flex -translate-y-1/2 items-center gap-0.5 rounded-md bg-shade-0 pl-1 opacity-0 transition-opacity group-hover:opacity-100
						{isDeleting || pinned ? 'opacity-100' : ''}"
					>
						{#if isSession && !isDeleting && (showQuickActions || pinned)}
							<button
								type="button"
								onclick={() => void toggleSessionPin(id)}
								title={pinned ? $LL.unpin() : $LL.pin()}
								aria-label={pinned ? $LL.unpin() : $LL.pin()}
								class="rounded p-1 text-muted transition-colors hover:text-active {pinned
									? 'text-accent hover:text-accent'
									: ''}"
							>
								<Pin class="h-3.5 w-3.5 {pinned ? 'fill-accent' : ''}" />
							</button>
						{/if}
						{#if showQuickActions || isDeleting}
							<ButtonDelete {sitemap} {id} bind:shouldConfirmDeletion={isDeleting} />
						{/if}
					</nav>
				{/if}
			</div>
		{/snippet}

		{#if isSession}
			<MenuItem icon={pinned ? PinOff : Pin} onclick={() => void toggleSessionPin(id)}>
				{pinned ? $LL.unpin() : $LL.pin()}
			</MenuItem>
			<MenuItem icon={Brain} onclick={() => void saveAsKnowledge()}>
				{$LL.saveAsKnowledge()}
			</MenuItem>

			<div class="my-1 h-px bg-shade-3" role="none"></div>

			<!-- The same two formats the conversation's own copy menu offers, so what
			     "copy this conversation" produces does not depend on where you asked. -->
			<MenuItem icon={FileText} onclick={() => void copyAs('markdown')}>
				{$LL.copyAsMarkdown()}
			</MenuItem>
			<MenuItem icon={Braces} onclick={() => void copyAs('json')}>
				{$LL.copyAsJson()}
			</MenuItem>

			<div class="my-1 h-px bg-shade-3" role="none"></div>
		{/if}

		<!-- Asks rather than does: the confirmation appears on the row, in the same
		     place it appears when the quick buttons are on. -->
		<MenuItem icon={Trash2} danger onclick={() => (isDeleting = true)}>
			{isSession ? $LL.deleteSession() : $LL.deleteKnowledge()}
		</MenuItem>
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
