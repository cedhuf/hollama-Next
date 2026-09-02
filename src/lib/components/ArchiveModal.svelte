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

	/** A dialog rather than a page: the archive is somewhere you visit, decide one thing and leave. It opens from a link at the foot of the conversation list. */
	interface Props {
		open: boolean;
	}

	let { open = $bindable(false) }: Props = $props();

	/** Which one is waiting for a second click, since deleting here loses the transcript. */
	let confirming = $state<string | null>(null);
	/** The same, for the one press that would take all of them at once. */
	let confirmingAll = $state(false);

	const archived = $derived(($sessionsStore ?? []).filter((session) => session.archived));

	function restore(session: SessionSummary) {
		void toggleSessionArchive(session.id);
	}

	async function restoreAll() {
		// Sequential rather than parallel: each one reads its conversation and writes it
		// back, and the store is not something to have several writers in at once.
		for (const session of [...archived]) await toggleSessionArchive(session.id);
	}

	function removeAll() {
		for (const session of [...archived]) remove(session);
		confirmingAll = false;
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
		<div class="border-shade-2 flex h-12 shrink-0 items-center justify-between gap-2 border-b px-4">
			<span class="text-active truncate text-sm font-semibold">
				{$LL.archivedSessions()}
				{#if archived.length}
					<span class="text-muted font-normal">· {archived.length}</span>
				{/if}
			</span>
			<div class="flex shrink-0 items-center gap-1">
				{#if archived.length > 0}
					{#if confirmingAll}
						<!-- Asks where it acts, the way a single row does, rather than in a dialog
						     stacked on this one. -->
						<button
							type="button"
							onclick={removeAll}
							class="text-negative hover:bg-shade-2 rounded-lg px-2.5 py-1 text-xs transition-colors"
						>
							{$LL.confirmDeletion()}
						</button>
						<button
							type="button"
							onclick={() => (confirmingAll = false)}
							class="text-muted hover:bg-shade-2 rounded-lg px-2.5 py-1 text-xs transition-colors"
						>
							{$LL.cancel()}
						</button>
					{:else}
						<button
							type="button"
							onclick={restoreAll}
							class="text-muted hover:bg-shade-2 hover:text-active rounded-lg px-2.5 py-1 text-xs transition-colors"
						>
							{$LL.archiveRestoreAll()}
						</button>
						<button
							type="button"
							onclick={() => (confirmingAll = true)}
							class="text-muted hover:bg-shade-2 hover:text-negative rounded-lg px-2.5 py-1 text-xs transition-colors"
						>
							{$LL.archiveDeleteAll()}
						</button>
					{/if}
				{/if}
				<button
					type="button"
					onclick={() => (open = false)}
					aria-label={$LL.close()}
					class="text-muted hover:bg-shade-2 hover:text-active rounded-md p-1.5 transition-colors"
				>
					<X class="h-4 w-4" />
				</button>
			</div>
		</div>

		<div class="min-h-0 flex-1 overflow-auto p-3">
			{#if archived.length === 0}
				<p class="text-muted pt-8 text-center text-sm">{$LL.archivedSessionsEmpty()}</p>
			{:else}
				<div class="flex flex-col gap-1">
					{#each archived as session (session.id)}
						<div
							class="hover:bg-shade-0 flex items-center gap-2 rounded-lg px-2.5 py-2 transition-colors"
							class:confirm-deletion={confirming === session.id}
						>
							<div class="min-w-0 flex-1">
								<p class="text-active truncate text-sm font-medium">
									{resolveSessionTitle(session)}
								</p>
								<p class="text-muted truncate text-xs">
									{formatSessionMetadata(session, $serversStore)}
								</p>
							</div>

							{#if confirming === session.id}
								<!-- Asks on the row, the way the list does, rather than in a dialog on a dialog. -->
								<button
									type="button"
									onclick={() => remove(session)}
									class="text-negative hover:bg-shade-2 shrink-0 rounded-lg px-2.5 py-1.5 text-xs transition-colors"
								>
									{$LL.confirmDeletion()}
								</button>
								<button
									type="button"
									onclick={() => (confirming = null)}
									class="text-muted hover:bg-shade-2 shrink-0 rounded-lg px-2.5 py-1.5 text-xs transition-colors"
								>
									{$LL.cancel()}
								</button>
							{:else}
								<button
									type="button"
									onclick={() => restore(session)}
									title={$LL.unarchiveSession()}
									aria-label={$LL.unarchiveSession()}
									class="text-muted hover:bg-shade-2 hover:text-active shrink-0 rounded-lg p-1.5 transition-colors"
								>
									<ArchiveRestore class="h-4 w-4" />
								</button>
								<button
									type="button"
									onclick={() => (confirming = session.id)}
									title={$LL.deleteSession()}
									aria-label={$LL.deleteSession()}
									class="text-muted hover:bg-shade-2 hover:text-negative shrink-0 rounded-lg p-1.5 transition-colors"
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
