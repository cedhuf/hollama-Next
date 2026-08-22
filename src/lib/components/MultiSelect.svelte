<script lang="ts">
	import { Check, ChevronsUpDown, Search } from '@lucide/svelte';
	import { Select } from 'bits-ui';

	/**
	 * Picks *several values from a list* — the multiple counterpart of `Select`.
	 *
	 * bits-ui keeps the panel open while entries are toggled, so this replaces the
	 * scrolling checkbox lists we used to hand-roll, and inherits the same
	 * portalling, flipping and keyboard behaviour as every other dropdown.
	 */
	interface Props {
		value?: string[];
		options: { value: string; label: string }[];
		placeholder?: string;
		disabled?: boolean;
		searchable?: boolean;
		class?: string;
		onChange?: (value: string[]) => void;
	}

	let {
		value = $bindable([]),
		options,
		placeholder = '',
		disabled = false,
		searchable = false,
		class: className = '',
		onChange
	}: Props = $props();

	let query = $state('');

	const shown = $derived(
		query.trim()
			? options.filter((o) => o.label.toLowerCase().includes(query.trim().toLowerCase()))
			: options
	);

	const summary = $derived(
		value.length === 0
			? placeholder
			: value.length === 1
				? (options.find((o) => o.value === value[0])?.label ?? `${value.length} selected`)
				: `${value.length} selected`
	);

	function handleChange(next: string[]) {
		value = next;
		onChange?.(next);
	}
</script>

<Select.Root
	type="multiple"
	bind:value={() => value, handleChange}
	{disabled}
	onOpenChange={(open) => {
		if (!open) query = '';
	}}
>
	<Select.Trigger
		class="select-trigger border-shade-3 bg-shade-0 focus:border-accent flex w-full items-center justify-between gap-2 rounded-md border px-2.5 py-1.5 text-sm transition-colors outline-none disabled:cursor-not-allowed disabled:opacity-50 {className}"
	>
		<span class="min-w-0 truncate text-left {value.length ? 'text-active' : 'text-muted'}">
			{summary}
		</span>
		<ChevronsUpDown class="text-muted h-4 w-4 shrink-0" />
	</Select.Trigger>

	<Select.Portal>
		<Select.Content
			sideOffset={6}
			collisionPadding={12}
			class="border-shade-3 bg-shade-0 z-50 max-h-[min(60dvh,20rem)] w-[var(--bits-select-anchor-width)] max-w-[calc(100vw-1.5rem)] min-w-[var(--bits-select-anchor-width)] overflow-y-auto rounded-xl border p-1.5 shadow-lg focus-visible:outline-none"
		>
			{#if searchable}
				<!-- Printable keys must not reach bits-ui's typeahead, or it would steal
				     them from this input and jump around the list instead. -->
				<div class="border-shade-2 mb-1 flex items-center gap-2 border-b px-2 pb-2">
					<Search class="text-muted h-4 w-4 shrink-0" />
					<input
						bind:value={query}
						{placeholder}
						class="placeholder:text-muted w-full bg-transparent text-sm outline-none"
						onkeydown={(e) => {
							if (e.key !== 'Escape' && e.key !== 'Enter' && !e.key.startsWith('Arrow'))
								e.stopPropagation();
						}}
					/>
				</div>
			{/if}

			{#each shown as option (option.value)}
				<Select.Item
					value={option.value}
					label={option.label}
					class="select-item text-active data-[highlighted]:bg-shade-1 flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-2 text-sm transition-colors select-none focus-visible:outline-none"
				>
					{#snippet children({ selected })}
						<span
							class="flex h-4 w-4 shrink-0 items-center justify-center rounded border {selected
								? 'border-accent bg-accent text-shade-0'
								: 'border-shade-4'}"
						>
							{#if selected}<Check class="h-3 w-3" />{/if}
						</span>
						<span class="min-w-0 flex-1 truncate" title={option.label}>{option.label}</span>
					{/snippet}
				</Select.Item>
			{:else}
				<p class="text-muted px-2.5 py-3 text-center text-sm">
					{query ? 'No matches' : placeholder}
				</p>
			{/each}
		</Select.Content>
	</Select.Portal>
</Select.Root>
