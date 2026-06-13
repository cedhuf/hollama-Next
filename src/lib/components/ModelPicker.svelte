<script lang="ts">
	import { Check, ChevronDown, Search, X } from '@lucide/svelte';

	import LL from '$i18n/i18n-svelte';
	import { ConnectionType } from '$lib/connections';
	import { serversStore, settingsStore } from '$lib/localStorage';
	import { type Model } from '$lib/settings';

	interface Props {
		value?: string;
		variant?: 'default' | 'hero';
		onSelect?: (name: string) => void;
	}

	let { value = $bindable(), variant = 'default', onSelect }: Props = $props();

	let open = $state(false);
	let query = $state('');
	let wrapper: HTMLDivElement | undefined = $state();
	let searchEl: HTMLInputElement | undefined = $state();

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

	// Models filtered by the search query, grouped by server (preserving order).
	const groups = $derived.by(() => {
		const q = query.trim().toLowerCase();
		const list = models.filter((m) => !q || m.name.toLowerCase().includes(q));
		const order: string[] = [];
		const byId: Record<string, Model[]> = {};
		for (const model of list) {
			if (!byId[model.serverId]) {
				byId[model.serverId] = [];
				order.push(model.serverId);
			}
			byId[model.serverId].push(model);
		}
		return order.map((serverId) => ({ serverId, ...provider(serverId), models: byId[serverId] }));
	});

	function selectModel(name: string) {
		value = name;
		open = false;
		query = '';
		onSelect?.(name);
	}

	function toggle() {
		open = !open;
		if (open) query = '';
	}

	$effect(() => {
		if (open) searchEl?.focus();
	});

	$effect(() => {
		if (!open) return;
		const onPointer = (e: PointerEvent) => {
			if (wrapper && !wrapper.contains(e.target as Node)) open = false;
		};
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape') open = false;
		};
		window.addEventListener('pointerdown', onPointer);
		window.addEventListener('keydown', onKey);
		return () => {
			window.removeEventListener('pointerdown', onPointer);
			window.removeEventListener('keydown', onKey);
		};
	});
</script>

<div class="relative {variant === 'hero' ? 'w-full max-w-xl' : 'w-64'}" bind:this={wrapper}>
	<!-- Trigger: a prominent field (hero) or a minimal textual line (default) -->
	<button
		type="button"
		onclick={toggle}
		class="flex w-full items-center gap-2 text-left transition-colors {variant === 'hero'
			? 'rounded-lg border border-shade-3 bg-shade-1 px-3 py-2 text-sm hover:border-shade-4'
			: 'text-xs text-muted hover:text-active'}"
	>
		<span class="truncate {value ? '' : 'text-muted'}">{value || $LL.availableModels()}</span>
		<ChevronDown
			class="ml-auto shrink-0 text-muted {variant === 'hero' ? 'h-4 w-4' : 'h-3.5 w-3.5'}"
		/>
	</button>

	{#if open}
		<!-- The list is an extension of the field: one connected surface -->
		<div
			class="fixed inset-x-4 bottom-4 z-50 flex flex-col overflow-hidden rounded-lg border border-shade-3 bg-shade-0 max-h-[60dvh]
				sm:absolute sm:inset-x-auto sm:bottom-auto sm:left-0 sm:top-0 sm:w-full sm:max-h-72"
		>
			<div class="flex items-center gap-2 px-3 py-2.5">
				<Search class="h-4 w-4 shrink-0 text-muted" />
				<input
					bind:this={searchEl}
					bind:value={query}
					placeholder={$LL.availableModels()}
					class="w-full bg-transparent text-sm outline-none placeholder:text-muted"
				/>
				<button type="button" onclick={() => (open = false)} aria-label="Close">
					<X class="h-4 w-4 shrink-0 text-muted transition-colors hover:text-active" />
				</button>
			</div>

			<div class="h-px bg-shade-3"></div>

			<div class="max-h-72 overflow-auto p-1.5">
				{#each groups as group (group.serverId)}
					<div class="px-2.5 pb-1 pt-2 text-[11px] text-muted">{group.title}</div>
					{#each group.models as model (model.name)}
						<button
							type="button"
							onclick={() => selectModel(model.name)}
							class="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left transition-colors hover:bg-shade-1 {value ===
							model.name
								? 'bg-shade-1'
								: ''}"
						>
							{#if value === model.name}
								<Check class="h-4 w-4 shrink-0 text-active" />
							{:else}
								<span class="w-4 shrink-0"></span>
							{/if}
							<span class="min-w-0 flex-1 truncate text-sm">
								{model.name}
								{#if model.parameterSize}
									<span class="text-xs text-muted">· {model.parameterSize}</span>
								{/if}
							</span>
							{#if group.badge.id}
								<span
									class="shrink-0 rounded-full border px-2 py-0.5 text-[11px]"
									style="border-color: {group.badge.color}; color: {group.badge.color}"
								>
									{group.badge.id}
								</span>
							{/if}
						</button>
					{/each}
				{/each}

				{#if groups.length === 0}
					<div class="px-2.5 py-3 text-center text-sm text-muted">
						{query ? 'No matching models' : $LL.availableModels()}
					</div>
				{/if}
			</div>
		</div>
	{/if}
</div>
