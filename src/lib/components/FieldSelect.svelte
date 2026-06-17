<script lang="ts">
	import { Check, ChevronsUpDown, X } from '@lucide/svelte';
	import { Combobox } from 'bits-ui';
	import type { LocalizedString } from 'typesafe-i18n';

	import LL from '$i18n/i18n-svelte';
	import Badge from '$lib/components/Badge.svelte';
	import Button from '$lib/components/Button.svelte';
	import Field from '$lib/components/Field.svelte';

	type Option = { value: string; label: string; badge?: string | string[] };
	type OptionGroup = { label: string; options: Option[] };
	type OptionOrGroup = Option | OptionGroup;

	const noSelection: Option = { value: '', label: '' };

	let {
		name,
		label,
		disabled = false,
		options = [] as OptionOrGroup[],
		value = $bindable(),
		placeholder = '',
		allowClear = true,
		allowSearch = true,
		isLabelVisible = true,
		onChange = () => {},
		nav
	}: {
		name: string;
		label: LocalizedString;
		disabled?: boolean;
		options?: OptionOrGroup[];
		value?: string;
		placeholder?: string;
		allowClear?: boolean;
		allowSearch?: boolean;
		isLabelVisible?: boolean;
		onChange?: (value: Option) => void;
		nav?: import('svelte').Snippet;
	} = $props();

	let open = $state(false);
	let searchText = $state('');
	// Mirror of the bindable `value` prop for the Combobox. Writes flow back to
	// `value` through the change handlers below, so no syncing effect is needed.
	let localValue = $derived(value ?? '');

	let isDisabled = $derived(disabled || options.length === 0);

	let selectedOption = $derived(
		value
			? options.flatMap((o) => ('options' in o ? o.options : o)).find((o) => o.value === value)
			: undefined
	);

	let filteredOptions = $derived(
		searchText
			? options
					.map((opt) => {
						if ('options' in opt) {
							return {
								label: opt.label,
								options: opt.options.filter((o) =>
									o.label?.toLowerCase().includes(searchText.toLowerCase())
								)
							};
						}
						return opt.label?.toLowerCase().includes(searchText.toLowerCase()) ? opt : null;
					})
					.filter(
						(opt): opt is OptionOrGroup =>
							opt !== null && (!('options' in opt) || opt.options.length > 0)
					)
			: options
	);

	function handleInputClick() {
		open = !open;
	}

	function handleValueChange(newValue: string) {
		value = newValue || undefined;
		if (newValue) {
			const option = options
				.flatMap((o) => ('options' in o ? o.options : o))
				.find((o) => o.value === newValue);
			if (option) {
				onChange(option);
			}
		}
	}

	function handleClear(e: MouseEvent) {
		e.stopPropagation();
		value = undefined;
		onChange(noSelection);
	}
</script>

<Field {name} disabled={isDisabled} hasNav={!!nav} {isLabelVisible}>
	<svelte:fragment slot="label">{label}</svelte:fragment>
	<Combobox.Root
		type="single"
		bind:open
		bind:value={localValue}
		disabled={isDisabled}
		onValueChange={handleValueChange}
	>
		<div class="field-select-input relative flex items-center">
			<Combobox.Input
				spellcheck="false"
				class="field-combobox-input base-input pr-14 text-sm {isLabelVisible
					? ''
					: 'field-combobox-input--no-label py-2.5'}"
				placeholder={selectedOption?.value ? selectedOption.label : placeholder}
				id={name}
				disabled={isDisabled}
				readonly={!allowSearch}
				onclick={handleInputClick}
				oninput={(e) => {
					const target = e.currentTarget as HTMLInputElement;
					searchText = target.value;
				}}
			/>

			<nav class="field-select-nav absolute bottom-0 right-0 m-1 flex items-center">
				{#if allowClear && localValue}
					<Button
						variant="icon"
						onclick={handleClear}
						title={$LL.clear()}
						class="pointer-events-auto"
					>
						<X class="base-icon" />
					</Button>
				{/if}

				<Combobox.Trigger class="py-2 pr-1">
					<ChevronsUpDown class="base-icon text-muted" />
				</Combobox.Trigger>
			</nav>
		</div>

		<Combobox.Content
			sideOffset={4}
			class="field-combobox-content overflow-scrollbar relative z-10 max-h-64 max-w-full rounded-md bg-shade-0 shadow-md"
		>
			{#each filteredOptions as group (group.label)}
				{#if 'options' in group}
					<Combobox.Group>
						<Combobox.GroupHeading
							class="field-combobox-group-label sticky top-0 border-b border-shade-3 bg-shade-2 px-3 py-2 text-xs font-semibold text-muted"
							>{group.label}</Combobox.GroupHeading
						>
						{#if group.options.length > 0}
							{#each group.options as option (option.value)}
								{#if option.label}
									<Combobox.Item
										value={option.value}
										label={option.label}
										class="field-combobox-item grid grid-cols-[24px,auto,max-content] items-center px-3 py-1.5 text-sm data-[highlighted]:bg-shade-1"
									>
										{#snippet children({ selected })}
											{#if selected}
												<span class="field-combobox-item-indicator flex items-center">
													<Check class="base-icon" />
												</span>
											{/if}
											<div
												class="field-combobox-item-label grid w-full cursor-pointer grid-cols-[auto,max-content] gap-x-1"
											>
												<span
													class="field-combobox-item-label-option overflow-hidden text-ellipsis text-nowrap"
													title={option.label}
												>
													{option.label}
												</span>
												{#if option.badge}
													{#if Array.isArray(option.badge)}
														<div class="field-select-badge flex gap-x-1">
															{#each option.badge as badge (badge)}
																<Badge
																	variant={badge === 'openai' || badge === 'ollama'
																		? badge
																		: undefined}
																>
																	{badge}
																</Badge>
															{/each}
														</div>
													{:else}
														<Badge>{option.badge}</Badge>
													{/if}
												{/if}
											</div>
										{/snippet}
									</Combobox.Item>
								{/if}
							{/each}
						{:else}
							<span class="field-select-empty block w-full px-3 py-1 text-center text-sm text-muted"
								>{$LL.noRecentModels()}</span
							>
						{/if}
					</Combobox.Group>
				{:else}
					<Combobox.Item
						value={group.value}
						label={group.label}
						class="field-combobox-item grid grid-cols-[24px,auto,max-content] items-center px-3 py-1.5 text-sm data-[highlighted]:bg-shade-1"
					>
						{#snippet children({ selected })}
							{#if selected}
								<span class="field-combobox-item-indicator flex items-center">
									<Check class="base-icon" />
								</span>
							{/if}
							<div
								class="field-combobox-item-label grid w-full cursor-pointer grid-cols-[auto,max-content] gap-x-1"
							>
								{group.label}
								{#if group.badge}
									<Badge>{group.badge}</Badge>
								{/if}
							</div>
						{/snippet}
					</Combobox.Item>
				{/if}
			{:else}
				<span class="field-select-empty block w-full px-3 py-1 text-center text-sm text-muted"
					>{$LL.searchEmpty()}</span
				>
			{/each}
		</Combobox.Content>
	</Combobox.Root>

	<svelte:fragment slot="nav">
		{#if nav}
			{@render nav()}
		{/if}
	</svelte:fragment>
</Field>
