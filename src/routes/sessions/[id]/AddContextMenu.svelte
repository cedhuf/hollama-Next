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
	 * Two steps rather than one long list: a collection can run to hundreds of
	 * entries, and a dropdown showing them all is a wall. The first view names the
	 * kinds, the second searches within one, which is what lets a new kind become a
	 * row up front instead of another list stapled to the same panel.
	 *
	 * A popover, not a menu: a menu captures the keyboard for its own typeahead.
	 * `Command` supplies the filtering, the arrow keys and Enter.
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
			class="text-muted hover:bg-shade-1 hover:text-active data-[state=open]:bg-shade-1 data-[state=open]:text-active flex items-center justify-center rounded-md px-2.5 py-2 transition-colors"
		>
			<Paperclip class="base-icon" />
		</button>
	{/snippet}

	{#if view === 'root'}
		<button
			type="button"
			onclick={pickImages}
			class="text-active hover:bg-shade-1 flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm transition-colors"
		>
			<Image class="text-muted h-4 w-4 shrink-0" />
			{$LL.attachImage()}
		</button>

		{#if documentsAvailable}
			<button
				type="button"
				onclick={pickDocuments}
				data-testid="add-document"
				class="text-active hover:bg-shade-1 flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm transition-colors"
			>
				<FileText class="text-muted h-4 w-4 shrink-0" />
				{$LL.attachDocument()}
			</button>
		{/if}

		<button
			type="button"
			onclick={showKnowledgeView}
			data-testid="add-knowledge"
			class="text-active hover:bg-shade-1 flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm transition-colors"
		>
			<Brain class="text-muted h-4 w-4 shrink-0" />
			<span class="flex-1">{$LL.knowledge()}</span>
			{#if knowledge.length}
				<span class="text-muted text-xs tabular-nums">{knowledge.length}</span>
			{/if}
			<ChevronRight class="text-muted h-4 w-4 shrink-0" />
		</button>
	{:else}
		<Command.Root loop class="flex flex-col">
			<div class="flex items-center gap-1 pb-1">
				<button
					type="button"
					onclick={() => (view = 'root')}
					aria-label={$LL.back()}
					class="text-muted hover:bg-shade-1 hover:text-active rounded-md p-1 transition-colors"
				>
					<ChevronLeft class="h-4 w-4" />
				</button>
				<span class="text-muted text-[11px] font-semibold tracking-wider uppercase">
					{$LL.knowledge()}
				</span>
			</div>

			<div class="relative">
				<Search
					class="text-muted pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2"
				/>
				<Command.Input
					bind:ref={searchInput}
					bind:value={search}
					placeholder={$LL.search()}
					class="border-shade-3 bg-shade-0 placeholder:text-muted focus:border-accent w-full rounded-md border py-1.5 pr-2.5 pl-8 text-sm outline-none"
				/>
			</div>

			<Command.List class="mt-1 max-h-56 overflow-y-auto">
				<Command.Viewport>
					<Command.Empty class="text-muted px-2.5 py-3 text-center text-xs">
						{knowledge.length ? $LL.searchEmpty() : $LL.emptyKnowledge()}
					</Command.Empty>

					<!-- A collection attaches as one gesture, which is what grouping was for. Its
					     pieces stay separate pills, so any one can be taken back off. -->
					{#each collections as collection (collection.id)}
						{@const items = knowledge.filter((item) => item.collectionId === collection.id)}
						{#if items.length}
							<Command.Item
								value={collection.name}
								keywords={items.map((item) => item.name)}
								onSelect={() => pickCollection(items)}
								class="text-active data-[selected]:bg-shade-1 flex cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors select-none"
							>
								<Folder class="text-muted h-4 w-4 shrink-0" />
								<span class="min-w-0 flex-1 truncate">{collection.name}</span>
								<span class="text-muted shrink-0 text-xs tabular-nums">{items.length}</span>
							</Command.Item>
						{/if}
					{/each}

					{#each knowledge as item (item.id)}
						{@const collection = collections.find((c) => c.id === item.collectionId)}
						<Command.Item
							value={item.name}
							keywords={collection ? [collection.name] : undefined}
							onSelect={() => pick(item)}
							class="text-active data-[selected]:bg-shade-1 flex cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors select-none"
						>
							<Brain class="text-muted h-4 w-4 shrink-0" />
							<span class="min-w-0 flex-1 truncate">{item.name}</span>
							{#if collection}
								<!-- Which folder it came out of, so two similarly named pieces of knowledge are
								     told apart without opening either. -->
								<span class="text-muted shrink-0 truncate text-[11px]">{collection.name}</span>
							{/if}
						</Command.Item>
					{/each}
				</Command.Viewport>
			</Command.List>

			<div class="border-shade-3 mt-1 border-t pt-1">
				<button
					type="button"
					onclick={newKnowledge}
					class="text-muted hover:bg-shade-1 hover:text-active flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm transition-colors"
				>
					<Plus class="h-4 w-4 shrink-0" />
					{$LL.newKnowledge()}
				</button>
			</div>
		</Command.Root>
	{/if}
</Popover>
