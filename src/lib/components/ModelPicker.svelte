<script lang="ts">
	import { ChevronDown } from '@lucide/svelte';

	import LL from '$i18n/i18n-svelte';
	import Select, { type SelectOptionOrGroup } from '$lib/components/Select.svelte';
	import { ConnectionType } from '$lib/connections';
	import { serversStore, settingsStore } from '$lib/localStorage';
	import { type Model } from '$lib/settings';

	/**
	 * Model chooser: the catalogue grouped by server, with a provider badge.
	 *
	 * Only the grouping and the trigger's two looks live here — the panel, search,
	 * keyboard handling and positioning all come from `Select`.
	 */
	interface Props {
		value?: string;
		variant?: 'default' | 'hero';
		onSelect?: (name: string) => void;
	}

	let { value = $bindable(), variant = 'default', onSelect }: Props = $props();

	const models = $derived($settingsStore.models || []);

	// Short, dark-mode-safe provider identity for the badge.
	const PROVIDER: Record<string, { id: string; color: string }> = {
		[ConnectionType.Ollama]: { id: 'ollama', color: '#1D9E75' },
		[ConnectionType.OpenAI]: { id: 'openai', color: '#378ADD' },
		[ConnectionType.Anthropic]: { id: 'claude', color: '#D85A30' },
		[ConnectionType.Infomaniak]: { id: 'infomaniak', color: '#BA7517' },
		[ConnectionType.OpenAICompatible]: { id: 'compatible', color: '#888780' }
	};

	function provider(serverId: string) {
		const server = $serversStore.find((s) => s.id === serverId);
		return {
			title: server?.label || PROVIDER[server?.connectionType ?? '']?.id || 'models',
			badge: PROVIDER[server?.connectionType ?? ''] ?? { id: '', color: '#888780' }
		};
	}

	/** One group per server, in the order the models appear. */
	const options = $derived.by<SelectOptionOrGroup[]>(() => {
		const order: string[] = [];
		const byId: Record<string, Model[]> = {};
		for (const model of models) {
			if (!byId[model.serverId]) {
				byId[model.serverId] = [];
				order.push(model.serverId);
			}
			byId[model.serverId].push(model);
		}
		return order.map((serverId) => {
			const { title, badge } = provider(serverId);
			return {
				label: title,
				options: byId[serverId].map((model) => ({
					value: model.name,
					label: model.name,
					hint: model.parameterSize,
					badge: badge.id || undefined,
					badgeColor: badge.color
				}))
			};
		});
	});
</script>

<Select
	bind:value
	{options}
	searchable
	placeholder={$LL.availableModels()}
	class={variant === 'hero' ? 'w-full max-w-xl' : 'w-64'}
	onChange={(option) => onSelect?.(option.value)}
>
	{#snippet trigger({ props, label, hasValue })}
		<button
			{...props}
			type="button"
			class="flex items-center gap-2 text-left transition-colors {variant === 'hero'
				? 'w-full max-w-xl rounded-lg border border-shade-3 bg-shade-1 px-3 py-2 text-sm hover:border-shade-4'
				: 'w-64 text-xs text-muted hover:text-active'}"
		>
			<span class="truncate {hasValue ? '' : 'text-muted'}">{label}</span>
			<ChevronDown
				class="ml-auto shrink-0 text-muted {variant === 'hero' ? 'h-4 w-4' : 'h-3.5 w-3.5'}"
			/>
		</button>
	{/snippet}
</Select>
