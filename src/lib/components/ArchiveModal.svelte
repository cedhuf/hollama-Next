<script lang="ts">
	import { ArchiveRestore, Trash2, X } from '@lucide/svelte';

	import LL from '$i18n/i18n-svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { serversStore, sessionsStore } from '$lib/localStorage';
	import { unbindPersonaSession } from '$lib/personas';
	import {
		formatSessionMetadata,
		resolveSessionTitle,
		toggleSessionArchive,
		type SessionSummary
	} from '$lib/sessions';

	import Modal from './Modal.svelte';

	/**
	 * Everything that was put out of the way, and the two things you can do to it.
	 *
	 * A dialog rather than a page: the archive is somewhere you visit, decide one
	 * thing and leave, not somewhere you work. It opens from a link at the foot of
	 * the conversation list, which is where you end up when you have scrolled past
	 * everything you actually have.
	 */
	interface Props {
		open: boolean;
	}

	let { open = $bindable(false) }: Props = $props();

	/** Which one is waiting for a second click, since deleting here loses the transcript. */
	let confirming = $state<string | null>(null);

	const archived = $derived(($sessionsStore ?? []).filter((session) => session.archived));

	function restore(session: SessionSummary) {
		void toggleSessionArchive(session.id);
	}

	function remove(session: SessionSummary) {
		sessionsStore.remove(session.id);
		unbindPersonaSession(session.id);
		confirming = null;
		// Deleting the conversation you are reading leaves the page on nothing.
		if (page.url.pathname.includes(session.id)) void goto(resolve('/sessions'));
	}
</script>

<Modal bind:open closeButton={false}>
	<div class="flex h-full w-full flex-col">
		<div class="flex h-12 shrink-0 items-center justify-between gap-2 border-b border-shade-2 px-4">
			<span class="truncate text-sm font-semibold text-active">
				{$LL.archivedSessions()}
				{#if archived.length}
					<span class="font-normal text-muted">· {archived.length}</span>
				{/if}
			</span>
			<button
				type="button"
				onclick={() => (open = false)}
				aria-label={$LL.close()}
				class="rounded-md p-1.5 text-muted transition-colors hover:bg-shade-2 hover:text-active"
			>
				<X class="h-4 w-4" />
			</button>
		</div>

		<div class="min-h-0 flex-1 overflow-auto p-3">
			{#if archived.length === 0}
				<p class="pt-8 text-center text-sm text-muted">{$LL.archivedSessionsEmpty()}</p>
			{:else}
				<div class="flex flex-col gap-1">
					{#each archived as session (session.id)}
						<div
							class="flex items-center gap-2 rounded-lg px-2.5 py-2 transition-colors hover:bg-shade-0"
							class:confirm-deletion={confirming === session.id}
						>
							<div class="min-w-0 flex-1">
								<p class="truncate text-sm font-medium text-active">
									{resolveSessionTitle(session)}
								</p>
								<p class="truncate text-xs text-muted">
									{formatSessionMetadata(session, $serversStore)}
								</p>
							</div>

							{#if confirming === session.id}
								<!-- Asks on the row, the way the list does, rather than in a dialog
								     stacked on a dialog. -->
								<button
									type="button"
									onclick={() => remove(session)}
									class="shrink-0 rounded-lg px-2.5 py-1.5 text-xs text-negative transition-colors hover:bg-shade-2"
								>
									{$LL.confirmDeletion()}
								</button>
								<button
									type="button"
									onclick={() => (confirming = null)}
									class="shrink-0 rounded-lg px-2.5 py-1.5 text-xs text-muted transition-colors hover:bg-shade-2"
								>
									{$LL.cancel()}
								</button>
							{:else}
								<button
									type="button"
									onclick={() => restore(session)}
									title={$LL.unarchiveSession()}
									aria-label={$LL.unarchiveSession()}
									class="shrink-0 rounded-lg p-1.5 text-muted transition-colors hover:bg-shade-2 hover:text-active"
								>
									<ArchiveRestore class="h-4 w-4" />
								</button>
								<button
									type="button"
									onclick={() => (confirming = session.id)}
									title={$LL.deleteSession()}
									aria-label={$LL.deleteSession()}
									class="shrink-0 rounded-lg p-1.5 text-muted transition-colors hover:bg-shade-2 hover:text-negative"
								>
									<Trash2 class="h-4 w-4" />
								</button>
							{/if}
						</div>
					{/each}
				</div>
			{/if}
		</div>
	</div>
</Modal>
