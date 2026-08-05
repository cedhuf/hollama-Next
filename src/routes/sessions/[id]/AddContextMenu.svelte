<script lang="ts">
	import {
		Brain,
		ChevronLeft,
		ChevronRight,
		FileText,
		Folder,
		Image,
		Paperclip,
		Plus,
		Search
	} from '@lucide/svelte';
	import { Command } from 'bits-ui';
	import { tick } from 'svelte';

	import LL from '$i18n/i18n-svelte';
	import Popover from '$lib/components/Popover.svelte';
	import type { Knowledge } from '$lib/knowledge';
	import { settingsStore } from '$lib/localStorage';
	import { openKnowledge } from '$lib/stores/modal';

	/**
	 * The one way to attach context to the next message.
	 *
	 * Two steps rather than one long list: a collection of knowledge can run to
	 * hundreds of entries, and a dropdown that tries to show them all is a wall.
	 * The first view names the kinds, the second one searches within a kind. It is
	 * the pattern behind every command palette people already know, and it is what
	 * lets a new kind (a PDF, a document) become one more row up front instead of
	 * another list stapled to the same panel.
	 *
	 * A popover, not a menu: a menu captures the keyboard for its own typeahead,
	 * which makes a search field inside one behave strangely. `Command` supplies
	 * the filtering, the arrow keys and Enter.
	 */
	interface Props {
		/** Knowledge not already attached. */
		knowledge: Knowledge[];
		/** False when the instance or the user has turned document reading off. */
		documentsAvailable?: boolean;
		onPickKnowledge: (knowledge: Knowledge) => void;
		onPickImages: () => void;
		onPickDocuments: () => void;
	}

	let {
		knowledge,
		documentsAvailable = true,
		onPickKnowledge,
		onPickImages,
		onPickDocuments
	}: Props = $props();

	const collections = $derived($settingsStore.knowledgeCollections ?? []);

	let open = $state(false);
	let view = $state<'root' | 'knowledge'>('root');
	let search = $state('');
	let searchInput = $state<HTMLInputElement | null>(null);

	// Closing forgets where you were: the next opening starts at the kinds, not
	// halfway through a search you have since forgotten making.
	$effect(() => {
		if (open) return;
		view = 'root';
		search = '';
	});

	async function showKnowledgeView() {
		view = 'knowledge';
		await tick();
		searchInput?.focus();
	}

	function pick(item: Knowledge) {
		onPickKnowledge(item);
		open = false;
	}

	function pickCollection(items: Knowledge[]) {
		for (const item of items) onPickKnowledge(item);
		open = false;
	}

	function pickImages() {
		open = false;
		onPickImages();
	}

	function pickDocuments() {
		open = false;
		onPickDocuments();
	}

	function newKnowledge() {
		open = false;
		openKnowledge();
	}
</script>

<Popover side="top" align="start" class="w-72" bind:open>
	{#snippet trigger({ props })}
		<button
			{...props}
			type="button"
			title={$LL.addContext()}
			aria-label={$LL.addContext()}
			data-testid="add-context"
			class="flex items-center justify-center rounded-md px-2.5 py-2 text-muted transition-colors hover:bg-shade-1 hover:text-active data-[state=open]:bg-shade-1 data-[state=open]:text-active"
		>
			<Paperclip class="base-icon" />
		</button>
	{/snippet}

	{#if view === 'root'}
		<button
			type="button"
			onclick={pickImages}
			class="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm text-active transition-colors hover:bg-shade-1"
		>
			<Image class="h-4 w-4 shrink-0 text-muted" />
			{$LL.attachImage()}
		</button>

		{#if documentsAvailable}
			<button
				type="button"
				onclick={pickDocuments}
				data-testid="add-document"
				class="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm text-active transition-colors hover:bg-shade-1"
			>
				<FileText class="h-4 w-4 shrink-0 text-muted" />
				{$LL.attachDocument()}
			</button>
		{/if}

		<button
			type="button"
			onclick={showKnowledgeView}
			data-testid="add-knowledge"
			class="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm text-active transition-colors hover:bg-shade-1"
		>
			<Brain class="h-4 w-4 shrink-0 text-muted" />
			<span class="flex-1">{$LL.knowledge()}</span>
			{#if knowledge.length}
				<span class="text-xs tabular-nums text-muted">{knowledge.length}</span>
			{/if}
			<ChevronRight class="h-4 w-4 shrink-0 text-muted" />
		</button>
	{:else}
		<Command.Root loop class="flex flex-col">
			<div class="flex items-center gap-1 pb-1">
				<button
					type="button"
					onclick={() => (view = 'root')}
					aria-label={$LL.back()}
					class="rounded-md p-1 text-muted transition-colors hover:bg-shade-1 hover:text-active"
				>
					<ChevronLeft class="h-4 w-4" />
				</button>
				<span class="text-[11px] font-semibold uppercase tracking-wider text-muted">
					{$LL.knowledge()}
				</span>
			</div>

			<div class="relative">
				<Search
					class="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted"
				/>
				<Command.Input
					bind:ref={searchInput}
					bind:value={search}
					placeholder={$LL.search()}
					class="w-full rounded-md border border-shade-3 bg-shade-0 py-1.5 pl-8 pr-2.5 text-sm outline-none placeholder:text-muted focus:border-accent"
				/>
			</div>

			<Command.List class="mt-1 max-h-56 overflow-y-auto">
				<Command.Viewport>
					<Command.Empty class="px-2.5 py-3 text-center text-xs text-muted">
						{knowledge.length ? $LL.searchEmpty() : $LL.emptyKnowledge()}
					</Command.Empty>

					<!-- A collection attaches as one gesture, which is what grouping was
					     for. Its pieces stay separate pills afterwards, so any one of them
					     can be taken back off. -->
					{#each collections as collection (collection.id)}
						{@const items = knowledge.filter((item) => item.collectionId === collection.id)}
						{#if items.length}
							<Command.Item
								value={collection.name}
								keywords={items.map((item) => item.name)}
								onSelect={() => pickCollection(items)}
								class="flex cursor-pointer select-none items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-active transition-colors data-[selected]:bg-shade-1"
							>
								<Folder class="h-4 w-4 shrink-0 text-muted" />
								<span class="min-w-0 flex-1 truncate">{collection.name}</span>
								<span class="shrink-0 text-xs tabular-nums text-muted">{items.length}</span>
							</Command.Item>
						{/if}
					{/each}

					{#each knowledge as item (item.id)}
						{@const collection = collections.find((c) => c.id === item.collectionId)}
						<Command.Item
							value={item.name}
							keywords={collection ? [collection.name] : undefined}
							onSelect={() => pick(item)}
							class="flex cursor-pointer select-none items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-active transition-colors data-[selected]:bg-shade-1"
						>
							<Brain class="h-4 w-4 shrink-0 text-muted" />
							<span class="min-w-0 flex-1 truncate">{item.name}</span>
							{#if collection}
								<!-- Which folder it came out of, so two similarly named pieces of
								     knowledge are told apart without opening either. -->
								<span class="shrink-0 truncate text-[11px] text-muted">{collection.name}</span>
							{/if}
						</Command.Item>
					{/each}
				</Command.Viewport>
			</Command.List>

			<div class="mt-1 border-t border-shade-3 pt-1">
				<button
					type="button"
					onclick={newKnowledge}
					class="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm text-muted transition-colors hover:bg-shade-1 hover:text-active"
				>
					<Plus class="h-4 w-4 shrink-0" />
					{$LL.newKnowledge()}
				</button>
			</div>
		</Command.Root>
	{/if}
</Popover>
