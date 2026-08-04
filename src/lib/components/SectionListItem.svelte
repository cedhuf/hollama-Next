<script lang="ts">
	import { Brain, Pin, PinOff, Trash2 } from '@lucide/svelte';
	import { toast } from 'svelte-sonner';

	import LL from '$i18n/i18n-svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { settingsStore } from '$lib/localStorage';
	import { saveSessionAsKnowledge } from '$lib/sessionExport';
	import { toggleSessionPin } from '$lib/sessions';
	import { Sitemap } from '$lib/sitemap';

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

	async function saveAsKnowledge() {
		const knowledge = await saveSessionAsKnowledge(id);
		if (!knowledge) return;
		toast.success($LL.savedAsKnowledge({ name: knowledge.name }), {
			action: {
				label: $LL.goToKnowledge(),
				onClick: () => void goto(generateNewUrl(Sitemap.KNOWLEDGE, knowledge.id))
			}
		});
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
		{/if}

		<!-- Asks rather than does: the confirmation appears on the row, in the same
		     place it appears when the quick buttons are on. -->
		<MenuItem icon={Trash2} danger onclick={() => (isDeleting = true)}>
			{isSession ? $LL.deleteSession() : $LL.deleteKnowledge()}
		</MenuItem>
	</ContextMenu>
{/key}
