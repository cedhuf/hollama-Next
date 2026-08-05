<script lang="ts">
	import { Check, ChevronDown, Folder, FolderX, Plus, Search } from '@lucide/svelte';
	import { Command } from 'bits-ui';
	import { tick } from 'svelte';

	import LL from '$i18n/i18n-svelte';
	import { createCollection } from '$lib/knowledge';
	import { settingsStore } from '$lib/localStorage';

	import Popover from './Popover.svelte';

	/**
	 * Which collection a piece of knowledge belongs to.
	 *
	 * The same panel the composer uses to pick knowledge, turned on collections:
	 * one search field, arrow keys, Enter. Picking where something is filed and
	 * picking what to attach are the same gesture, so they should not be two
	 * different widgets.
	 *
	 * Typing a name that does not exist offers to create it, which is how a
	 * collection gets made without a second dialog opening on top of the first.
	 */
	interface Props {
		value: string;
		/** Extra classes for the trigger, usually a width. */
		class?: string;
	}

	let { value = $bindable(''), class: className = '' }: Props = $props();

	let open = $state(false);
	let search = $state('');
	let searchInput = $state<HTMLInputElement | null>(null);

	const collections = $derived($settingsStore.knowledgeCollections ?? []);
	const current = $derived(collections.find((collection) => collection.id === value) ?? null);

	// Offered only when the typed name is new: suggesting "create Work" under an
	// existing Work is how you end up with two of them.
	const typed = $derived(search.trim());
	const canCreate = $derived(
		!!typed &&
			!collections.some((collection) => collection.name.toLowerCase() === typed.toLowerCase())
	);

	// Focus follows the panel opening rather than a click handler on the trigger:
	// the trigger's own click is what opens it, and putting ours there replaced it,
	// which is why the button did nothing at all.
	$effect(() => {
		if (!open) {
			search = '';
			return;
		}
		void tick().then(() => searchInput?.focus());
	});

	function choose(id: string) {
		value = id;
		open = false;
	}

	function create() {
		value = createCollection(typed).id;
		open = false;
	}
</script>

<Popover side="bottom" align="start" class="w-64" bind:open>
	{#snippet trigger({ props })}
		<button
			{...props}
			type="button"
			data-testid="collection-select"
			class="flex items-center gap-1.5 rounded-md border border-shade-3 bg-shade-0 px-2 py-1 text-xs transition-colors hover:border-shade-4 data-[state=open]:border-accent {className}"
		>
			<Folder class="h-3.5 w-3.5 shrink-0 text-muted" />
			<span class="min-w-0 truncate {current ? 'text-active' : 'text-muted'}">
				{current ? current.name : $LL.noCollection()}
			</span>
			<ChevronDown class="h-3.5 w-3.5 shrink-0 text-muted" />
		</button>
	{/snippet}

	<Command.Root loop class="flex flex-col">
		<div class="relative">
			<Search
				class="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted"
			/>
			<Command.Input
				bind:ref={searchInput}
				bind:value={search}
				placeholder={$LL.collectionSearchPlaceholder()}
				class="w-full rounded-md border border-shade-3 bg-shade-0 py-1.5 pl-8 pr-2.5 text-sm outline-none placeholder:text-muted focus:border-accent"
			/>
		</div>

		<Command.List class="mt-1 max-h-52 overflow-y-auto">
			<Command.Viewport>
				<!-- No empty state: the create row below covers it, and an empty list
				     that says "nothing found" over a "create it then" is one line too
				     many. -->
				<Command.Item
					value={$LL.noCollection()}
					onSelect={() => choose('')}
					class="flex cursor-pointer select-none items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors data-[selected]:bg-shade-1 {value
						? 'text-muted'
						: 'text-active'}"
				>
					<FolderX class="h-4 w-4 shrink-0 text-muted" />
					<span class="flex-1 truncate">{$LL.noCollection()}</span>
					{#if !value}<Check class="h-3.5 w-3.5 shrink-0 text-accent" />{/if}
				</Command.Item>

				{#each collections as collection (collection.id)}
					<Command.Item
						value={collection.name}
						onSelect={() => choose(collection.id)}
						class="flex cursor-pointer select-none items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-active transition-colors data-[selected]:bg-shade-1"
					>
						<Folder class="h-4 w-4 shrink-0 text-muted" />
						<span class="flex-1 truncate">{collection.name}</span>
						{#if value === collection.id}<Check class="h-3.5 w-3.5 shrink-0 text-accent" />{/if}
					</Command.Item>
				{/each}
			</Command.Viewport>
		</Command.List>

		{#if canCreate}
			<div class="mt-1 border-t border-shade-3 pt-1">
				<button
					type="button"
					onclick={create}
					class="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm text-active transition-colors hover:bg-shade-1"
				>
					<Plus class="h-4 w-4 shrink-0 text-muted" />
					<span class="truncate">{$LL.createCollectionNamed({ name: typed })}</span>
				</button>
			</div>
		{/if}
	</Command.Root>
</Popover>
