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
	 * filing something and attaching something are the same gesture, so they should
	 * not be two widgets.
	 *
	 * Typing a name that does not exist offers to create it, which is how a
	 * collection gets made without a second dialog over the first.
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
	// the trigger's own click is what opens it, and putting ours there replaced it.
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
			class="border-shade-3 bg-shade-0 hover:border-shade-4 data-[state=open]:border-accent flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs transition-colors {className}"
		>
			<Folder class="text-muted h-3.5 w-3.5 shrink-0" />
			<span class="min-w-0 truncate {current ? 'text-active' : 'text-muted'}">
				{current ? current.name : $LL.noCollection()}
			</span>
			<ChevronDown class="text-muted h-3.5 w-3.5 shrink-0" />
		</button>
	{/snippet}

	<Command.Root loop class="flex flex-col">
		<div class="relative">
			<Search
				class="text-muted pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2"
			/>
			<Command.Input
				bind:ref={searchInput}
				bind:value={search}
				placeholder={$LL.collectionSearchPlaceholder()}
				class="border-shade-3 bg-shade-0 placeholder:text-muted focus:border-accent w-full rounded-md border py-1.5 pr-2.5 pl-8 text-sm outline-none"
			/>
		</div>

		<Command.List class="mt-1 max-h-52 overflow-y-auto">
			<Command.Viewport>
				<!-- No empty state: the create row below covers it, and "nothing found" over a
				     "create it then" is one line too many. -->
				<Command.Item
					value={$LL.noCollection()}
					onSelect={() => choose('')}
					class="data-[selected]:bg-shade-1 flex cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors select-none {value
						? 'text-muted'
						: 'text-active'}"
				>
					<FolderX class="text-muted h-4 w-4 shrink-0" />
					<span class="flex-1 truncate">{$LL.noCollection()}</span>
					{#if !value}<Check class="text-accent h-3.5 w-3.5 shrink-0" />{/if}
				</Command.Item>

				{#each collections as collection (collection.id)}
					<Command.Item
						value={collection.name}
						onSelect={() => choose(collection.id)}
						class="text-active data-[selected]:bg-shade-1 flex cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors select-none"
					>
						<Folder class="text-muted h-4 w-4 shrink-0" />
						<span class="flex-1 truncate">{collection.name}</span>
						{#if value === collection.id}<Check class="text-accent h-3.5 w-3.5 shrink-0" />{/if}
					</Command.Item>
				{/each}
			</Command.Viewport>
		</Command.List>

		{#if canCreate}
			<div class="border-shade-3 mt-1 border-t pt-1">
				<button
					type="button"
					onclick={create}
					class="text-active hover:bg-shade-1 flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm transition-colors"
				>
					<Plus class="text-muted h-4 w-4 shrink-0" />
					<span class="truncate">{$LL.createCollectionNamed({ name: typed })}</span>
				</button>
			</div>
		{/if}
	</Command.Root>
</Popover>
