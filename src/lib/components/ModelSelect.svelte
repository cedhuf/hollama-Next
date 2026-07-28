<script lang="ts">
	import { ChevronDown } from '@lucide/svelte';

	import LL from '$i18n/i18n-svelte';
	import Select, { type SelectOptionOrGroup } from '$lib/components/Select.svelte';
	import { modelLabel, serverBadge } from '$lib/connections';
	import { serversStore, settingsStore } from '$lib/localStorage';
	import { type Model } from '$lib/settings';

	/**
	 * The single model chooser for the whole app.
	 *
	 * One list everywhere: recently used first, then the rest — each row carrying its
	 * parameter size and a provider badge. Only the trigger changes between contexts;
	 * the panel, grouping, search and keyboard handling are always identical.
	 */
	interface Props {
		value?: string;
		/**
		 * `hero` — wide home-screen field.
		 * `default` — standard form field.
		 * `attached` — left half of a joined control: it draws no outer border of its
		 *   own (the wrapper owns it, so focus rings the whole group), only a divider
		 *   towards its neighbour. Its width is fluid so it borrows whatever room the
		 *   header has to spare.
		 */
		variant?: 'default' | 'hero' | 'attached';
		onSelect?: (name: string) => void;
	}

	let { value = $bindable(), variant = 'default', onSelect }: Props = $props();

	/** Badge for a model's connection — honours the colour set on that connection. */
	function badgeFor(serverId: string) {
		const server = $serversStore.find((s) => s.id === serverId);
		return server ? serverBadge(server) : { id: '', color: '#888780' };
	}

	function toOption(model: Model) {
		const badge = badgeFor(model.serverId);
		const server = $serversStore.find((s) => s.id === model.serverId);
		return {
			value: model.name,
			// Display-only: the value stays the real id, which is what gets sent.
			label: modelLabel(server, model.name),
			hint: model.parameterSize,
			badge: badge.id || undefined,
			badgeColor: badge.color
		};
	}

	const models = $derived($settingsStore.models ?? []);
	// Recently used, restricted to models that still exist in the catalogue.
	const recent = $derived(
		($settingsStore.lastUsedModels ?? []).filter((m) => models.some((x) => x.name === m.name))
	);
	const rest = $derived(models.filter((m) => !recent.some((r) => r.name === m.name)));

	const options = $derived.by<SelectOptionOrGroup[]>(() =>
		[
			...(recent.length ? [{ label: $LL.lastUsedModels(), options: recent.map(toOption) }] : []),
			{ label: $LL.otherModels(), options: rest.map(toOption) }
		].filter((group) => group.options.length > 0)
	);
</script>

<Select
	bind:value
	{options}
	searchable
	allowClear
	placeholder={$LL.availableModels()}
	onChange={(option) => onSelect?.(option.value)}
>
	{#snippet trigger({ props, label, hasValue })}
		<!-- Same bordered control everywhere — only the scale changes, so it reads as
		     one component whether it anchors the home screen or sits in a header row. -->
		{#if variant === 'attached'}
			<button
				{...props}
				type="button"
				aria-label={$LL.availableModels()}
				class="flex h-8 w-[clamp(9rem,16vw,18rem)] items-center gap-1.5 rounded-l-md border-r border-shade-3 bg-transparent px-2.5 text-xs text-muted transition-colors hover:bg-shade-2 hover:text-active focus:outline-none"
			>
				<span class="truncate">{label}</span>
				<ChevronDown class="ml-auto h-3.5 w-3.5 shrink-0 opacity-70" />
			</button>
		{:else}
			<button
				{...props}
				type="button"
				aria-label={$LL.availableModels()}
				class="flex items-center gap-2 rounded-lg border border-shade-3 bg-shade-0 px-3 py-2 text-left text-sm transition-colors hover:border-shade-4 focus:border-accent focus:outline-none {variant ===
				'hero'
					? 'w-full max-w-xl'
					: 'w-64 max-w-full'}"
			>
				<span class="truncate {hasValue ? 'text-active' : 'text-muted'}">{label}</span>
				<ChevronDown class="ml-auto h-4 w-4 shrink-0 text-muted" />
			</button>
		{/if}
	{/snippet}
</Select>
