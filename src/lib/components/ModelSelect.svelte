<script lang="ts">
	import { ChevronDown } from '@lucide/svelte';

	import LL from '$i18n/i18n-svelte';
	import Select, { type SelectOptionOrGroup } from '$lib/components/Select.svelte';
	import { ConnectionType } from '$lib/connections';
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
		/** `hero` is the wide home-screen field; `default` the compact one. */
		variant?: 'default' | 'hero';
		onSelect?: (name: string) => void;
	}

	let { value = $bindable(), variant = 'default', onSelect }: Props = $props();

	// Short, dark-mode-safe provider identity for the badge.
	const PROVIDER: Record<string, { id: string; color: string }> = {
		[ConnectionType.Ollama]: { id: 'ollama', color: '#1D9E75' },
		[ConnectionType.OpenAI]: { id: 'openai', color: '#378ADD' },
		[ConnectionType.Anthropic]: { id: 'claude', color: '#D85A30' },
		[ConnectionType.Infomaniak]: { id: 'infomaniak', color: '#BA7517' },
		[ConnectionType.OpenAICompatible]: { id: 'compatible', color: '#888780' }
	};

	function badgeFor(serverId: string) {
		const server = $serversStore.find((s) => s.id === serverId);
		return PROVIDER[server?.connectionType ?? ''] ?? { id: '', color: '#888780' };
	}

	function toOption(model: Model) {
		const badge = badgeFor(model.serverId);
		return {
			value: model.name,
			label: model.name,
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
		<!-- Same bordered field in both variants — only the width differs, so the
		     control reads as the same thing wherever it appears. -->
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
	{/snippet}
</Select>
