<script lang="ts">
	import { Check, ChevronsUpDown, Search, X } from '@lucide/svelte';
	import { Select } from 'bits-ui';
	import type { Snippet } from 'svelte';

	import Badge from '$lib/components/Badge.svelte';

	export type SelectOption = {
		value: string;
		label: string;
		badge?: string | string[];
		/** Secondary text shown after the label (e.g. a parameter size). */
		hint?: string;
		/** Colours the badge inline instead of using the Badge variants. */
		badgeColor?: string;
	};
	export type SelectGroup = { label: string; options: SelectOption[] };
	export type SelectOptionOrGroup = SelectOption | SelectGroup;

	/**
	 * Picks *one value from a list* (the action counterpart is `Menu`).
	 *
	 * Built on bits-ui, so it is portalled (never clipped by an `overflow-hidden`
	 * ancestor), flips when there is no room below, matches the trigger's width and
	 * supports keyboard typeahead. None of which a hand-rolled panel or a raw
	 * `<select>` gave us consistently.
	 */
	interface Props {
		value?: string;
		options: SelectOptionOrGroup[];
		placeholder?: string;
		disabled?: boolean;
		/** Rendered as the first, empty entry: lets the user pick "nothing". */
		emptyLabel?: string;
		id?: string;
		name?: string;
		class?: string;
		/** Adds a filter box above the list, for long lists like model catalogues. */
		searchable?: boolean;
		searchPlaceholder?: string;
		/** Replaces the default trigger; receives the props to spread onto your button. */
		trigger?: Snippet<[{ props: Record<string, unknown>; label: string; hasValue: boolean }]>;
		/** Shows an inline clear (✕) button once a value is set. */
		allowClear?: boolean;
		onChange?: (option: SelectOption) => void;
	}

	let {
		value = $bindable(),
		options,
		placeholder = '',
		disabled = false,
		emptyLabel,
		id,
		name,
		class: className = '',
		searchable = false,
		searchPlaceholder = '',
		trigger,
		allowClear = false,
		onChange
	}: Props = $props();

	let open = $state(false);
	let query = $state('');

	/** Filtered view of `options`, preserving groups and dropping the empty ones. */
	const shown = $derived.by(() => {
		const q = query.trim().toLowerCase();
		if (!q) return options;
		return options
			.map((entry) =>
				'options' in entry
					? { ...entry, options: entry.options.filter((o) => o.label.toLowerCase().includes(q)) }
					: entry
			)
			.filter((entry) =>
				'options' in entry ? entry.options.length > 0 : entry.label.toLowerCase().includes(q)
			);
	});

	const flat = $derived(options.flatMap((entry) => ('options' in entry ? entry.options : [entry])));
	const selected = $derived(flat.find((option) => option.value === value));
	const isDisabled = $derived(disabled || flat.length === 0);

	function handleValueChange(next: string) {
		value = next || undefined;
		query = '';
		const option = flat.find((o) => o.value === next);
		onChange?.(option ?? { value: '', label: emptyLabel ?? '' });
	}
</script>

{#snippet row(option: SelectOption)}
	<Select.Item
		value={option.value}
		label={option.label}
		class="select-item text-active data-[highlighted]:bg-shade-1 flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-2 text-sm transition-colors select-none focus-visible:outline-none"
	>
		{#snippet children({ selected: isSelected })}
			<!-- The check cell is always rendered so labels never reflow between states. -->
			<span class="flex h-4 w-4 shrink-0 items-center justify-center">
				{#if isSelected}<Check class="h-4 w-4" />{/if}
			</span>
			<!-- When a label hides the underlying id (renamed models), the tooltip shows it. -->
			<span
				class="min-w-0 flex-1 truncate"
				title={option.value && option.value !== option.label ? option.value : option.label}
			>
				{option.label}{#if option.hint}<span class="text-muted text-xs"> · {option.hint}</span>{/if}
			</span>
			{#if option.badge}
				<span class="flex shrink-0 items-center gap-1">
					{#each Array.isArray(option.badge) ? option.badge : [option.badge] as badge (badge)}
						{#if badge}
							{#if option.badgeColor}
								<!-- Provider pill in the connection's own colour. It is always shown:
								     the panel width is copied from the trigger, so there is no varying
								     "available space" a responsive rule could react to. -->
								<span
									class="shrink-0 rounded-full border px-2 py-0.5 text-[11px]"
									style="border-color: {option.badgeColor}; color: {option.badgeColor}"
								>
									{badge}
								</span>
							{:else}
								<Badge variant={badge === 'openai' || badge === 'ollama' ? badge : undefined}>
									{badge}
								</Badge>
							{/if}
						{/if}
					{/each}
				</span>
			{/if}
		{/snippet}
	</Select.Item>
{/snippet}

<Select.Root
	type="single"
	bind:open
	bind:value={() => value ?? '', handleValueChange}
	{name}
	disabled={isDisabled}
>
	{#if trigger}
		<Select.Trigger {id}>
			{#snippet child({ props })}
				{@render trigger({
					props,
					label: selected?.label ?? emptyLabel ?? placeholder,
					hasValue: !!selected
				})}
			{/snippet}
		</Select.Trigger>
	{:else}
		<Select.Trigger
			{id}
			class="select-trigger settings-field flex items-center justify-between gap-2 transition-colors disabled:cursor-not-allowed disabled:opacity-50 {className}"
		>
			<span class="min-w-0 truncate text-left {selected ? '' : 'text-muted'}">
				{selected?.label ?? emptyLabel ?? placeholder}
			</span>
			<span class="flex shrink-0 items-center gap-1">
				{#if allowClear && selected}
					<!-- Inside the trigger, so it needs to swallow the click that would open it. -->
					<span
						role="button"
						tabindex="0"
						aria-label="Clear"
						class="text-muted hover:text-active rounded p-0.5 transition-colors"
						onclick={(e) => {
							e.stopPropagation();
							handleValueChange('');
						}}
						onkeydown={(e) => {
							if (e.key !== 'Enter' && e.key !== ' ') return;
							e.stopPropagation();
							e.preventDefault();
							handleValueChange('');
						}}
					>
						<X class="h-4 w-4" />
					</span>
				{/if}
				<ChevronsUpDown class="text-muted h-4 w-4" />
			</span>
		</Select.Trigger>
	{/if}

	<Select.Portal>
		<Select.Content
			sideOffset={6}
			collisionPadding={12}
			class="border-shade-3 bg-shade-0 z-50 max-h-[min(60dvh,20rem)] w-[var(--bits-select-anchor-width)] max-w-[calc(100vw-1.5rem)] min-w-[max(var(--bits-select-anchor-width),16rem)] overflow-y-auto rounded-xl border p-1.5 shadow-lg focus-visible:outline-none"
		>
			{#if searchable}
				<!-- Printable keys must not reach bits-ui's typeahead, or it would steal
				     them from this input and jump around the list instead. -->
				<div class="border-shade-2 mb-1 flex items-center gap-2 border-b px-2 pb-2">
					<Search class="text-muted h-4 w-4 shrink-0" />
					<input
						bind:value={query}
						placeholder={searchPlaceholder || placeholder}
						class="placeholder:text-muted w-full bg-transparent text-sm outline-none"
						onkeydown={(e) => {
							if (e.key !== 'Escape' && e.key !== 'Enter' && !e.key.startsWith('Arrow'))
								e.stopPropagation();
						}}
					/>
				</div>
			{/if}
			{#if emptyLabel && !query}
				{@render row({ value: '', label: emptyLabel })}
			{/if}
			{#each shown as entry (entry.label)}
				{#if 'options' in entry}
					{#if entry.options.length}
						<Select.Group>
							<Select.GroupHeading
								class="text-muted px-2.5 py-1.5 text-xs font-semibold tracking-wide uppercase"
							>
								{entry.label}
							</Select.GroupHeading>
							{#each entry.options as option (option.value)}
								{@render row(option)}
							{/each}
						</Select.Group>
					{/if}
				{:else}
					{@render row(entry)}
				{/if}
			{:else}
				<p class="text-muted px-2.5 py-3 text-center text-sm">
					{query ? 'No matches' : placeholder}
				</p>
			{/each}
		</Select.Content>
	</Select.Portal>
</Select.Root>
