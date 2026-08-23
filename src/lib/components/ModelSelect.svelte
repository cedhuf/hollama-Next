<script lang="ts">
	import { ChevronDown } from '@lucide/svelte';

	import LL from '$i18n/i18n-svelte';
	import Select, { type SelectOptionOrGroup } from '$lib/components/Select.svelte';
	import { modelKind, modelLabel, serverBadge, type ModelKind } from '$lib/connections';
	import { serversStore, settingsStore } from '$lib/localStorage';
	import { type Model } from '$lib/settings';

	/**
	 * The single model chooser for the whole app.
	 *
	 * One list everywhere: recently used first, then the rest, each row carrying its
	 * parameter size and a provider badge. Only the trigger changes between contexts;
	 * the panel, grouping, search and keyboard handling are always identical.
	 */
	interface Props {
		value?: string;
		/**
		 * `hero`: wide home-screen field.
		 * `default`: standard form field, filling its `SettingsField`.
		 * `attached`: left half of a joined control: it draws no outer border of its
		 *   own (the wrapper owns it, so focus rings the whole group), only a divider
		 *   towards its neighbour. Its width is fluid so it borrows whatever room the
		 *   header has to spare.
		 */
		variant?: 'default' | 'hero' | 'attached';
		/**
		 * The label for choosing no model at all.
		 *
		 * A persona that names none is not misconfigured: it runs on whatever the
		 * reader's default is, which is the sane thing for one that travels between
		 * installs. Without an entry saying so, an empty field reads as unfinished.
		 */
		emptyLabel?: string;
		/**
		 * Which kinds of model this picker is choosing between.
		 *
		 * Text alone by default, which is what every existing caller means: an
		 * embedding model in the chat picker is not clutter, it is a 400 with no
		 * explanation attached, and it is exactly what somebody hit. The page that
		 * draws asks for images instead, and neither has to know about the other.
		 */
		kinds?: ModelKind[];
		onSelect?: (name: string) => void;
	}

	let {
		value = $bindable(),
		variant = 'default',
		emptyLabel,
		kinds = ['text'],
		onSelect
	}: Props = $props();

	/** Badge for a model's connection: honours the colour set on that connection. */
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

	/**
	 * The catalogue, cut down to what this picker is for.
	 *
	 * A model already chosen stays in the list whatever its kind. Filtering it out
	 * would empty the field of a conversation that has been running for weeks, and
	 * a picker that silently forgets the answer it is showing is worse than one
	 * offering a model somebody has mis-sorted.
	 */
	const models = $derived(
		($settingsStore.models ?? []).filter((model) => {
			if (model.name === value) return true;
			const server = $serversStore.find((s) => s.id === model.serverId);
			return kinds.includes(modelKind(server, model.name));
		})
	);
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
	{emptyLabel}
	searchable
	allowClear
	placeholder={$LL.availableModels()}
	onChange={(option) => onSelect?.(option.value)}
>
	{#snippet trigger({ props, label, hasValue })}
		<!-- Same bordered control everywhere, only the scale changes, so it reads as
		     one component whether it anchors the home screen or sits in a header row. -->
		{#if variant === 'attached'}
			<button
				{...props}
				type="button"
				aria-label={$LL.availableModels()}
				class="border-shade-3 text-muted hover:bg-shade-2 hover:text-active flex h-8 w-[clamp(9rem,16vw,18rem)] items-center gap-1.5 rounded-l-md border-r bg-transparent px-2.5 text-xs transition-colors focus:outline-none"
			>
				<span class="truncate">{label}</span>
				<ChevronDown class="ml-auto h-3.5 w-3.5 shrink-0 opacity-70" />
			</button>
		{:else}
			<button
				{...props}
				type="button"
				aria-label={$LL.availableModels()}
				class="border-shade-3 bg-shade-0 hover:border-shade-4 focus:border-accent flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors focus:outline-none {variant ===
				'hero'
					? 'w-full max-w-xl'
					: 'w-full'}"
			>
				<span class="truncate {hasValue ? 'text-active' : 'text-muted'}">{label}</span>
				<ChevronDown class="text-muted ml-auto h-4 w-4 shrink-0" />
			</button>
		{/if}
	{/snippet}
</Select>
