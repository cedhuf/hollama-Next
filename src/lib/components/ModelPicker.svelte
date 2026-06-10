<script lang="ts">
	import { ChevronDown } from '@lucide/svelte';
	import { Popover } from 'bits-ui';
	import LL from '$i18n/i18n-svelte';
	import Badge from '$lib/components/Badge.svelte';
	import { serversStore, settingsStore } from '$lib/localStorage';
	import { type Model } from '$lib/settings';

	interface Props {
		value?: string;
		variant?: 'default' | 'hero';
	}

	let { value = $bindable(), variant = 'default' }: Props = $props();

	let open = $state(false);

	const models = $derived($settingsStore.models || []);
	const lastUsedModels = $derived($settingsStore.lastUsedModels || []);
	const otherModels = $derived(
		models.filter((m: Model) => !lastUsedModels.some((lm: Model) => lm.name === m.name))
	);

	function formatBadge(model: Model): string[] {
		const badges: string[] = [];
		const modelServer = $serversStore.find((s) => s.id === model.serverId);
		if (model.parameterSize) badges.push(model.parameterSize);
		badges.push(modelServer?.label || modelServer?.connectionType || '');
		return badges;
	}

	function selectModel(modelName: string) {
		value = modelName;
		open = false;
	}
</script>

<Popover.Root bind:open>
	<Popover.Trigger>
		{#if variant === 'hero'}
			<button
				class="group flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-active"
				type="button"
			>
				<span class="font-medium">{value || $LL.availableModels()}</span>
				<ChevronDown class="h-3.5 w-3.5 transition-transform group-hover:translate-y-px" />
			</button>
		{:else}
			<button
				class="flex items-center gap-0.5 text-xs text-muted transition-colors hover:text-active"
				type="button"
			>
				<span>{value || $LL.availableModels()}</span>
				<ChevronDown class="h-3 w-3" />
			</button>
		{/if}
	</Popover.Trigger>
	<Popover.Portal>
		<Popover.Content
			side="bottom"
			sideOffset={4}
			align={variant === 'hero' ? 'center' : 'start'}
			class="z-50 max-h-72 min-w-[240px] overflow-auto rounded-md border border-shade-3 bg-shade-0 shadow-lg"
		>
			{#if lastUsedModels.length}
				<div
					class="sticky top-0 border-b border-shade-3 bg-shade-2 px-3 py-1.5 text-xs font-semibold text-muted"
				>
					{$LL.lastUsedModels()}
				</div>
				{#each lastUsedModels as model (model.name)}
					<button
						class="flex w-full items-center justify-between gap-x-2 px-3 py-1.5 text-left text-sm hover:bg-shade-1 {value === model.name
							? 'text-active'
							: ''}"
						onclick={() => selectModel(model.name)}
						type="button"
					>
						<span class="truncate">{model.name}</span>
						<div class="flex shrink-0 gap-x-1">
							{#each formatBadge(model) as badge (badge)}
								<Badge
									variant={badge === 'openai' || badge === 'ollama' ? badge : undefined}
								>
									{badge}
								</Badge>
							{/each}
						</div>
					</button>
				{/each}
			{/if}

			<div
				class="sticky top-0 border-b border-shade-3 bg-shade-2 px-3 py-1.5 text-xs font-semibold text-muted"
			>
				{$LL.otherModels()}
			</div>
			{#each otherModels as model (model.name)}
				<button
					class="flex w-full items-center justify-between gap-x-2 px-3 py-1.5 text-left text-sm hover:bg-shade-1 {value === model.name
						? 'text-active'
						: ''}"
					onclick={() => selectModel(model.name)}
					type="button"
				>
					<span class="truncate">{model.name}</span>
					<div class="flex shrink-0 gap-x-1">
						{#each formatBadge(model) as badge (badge)}
							<Badge
								variant={badge === 'openai' || badge === 'ollama' ? badge : undefined}
							>
								{badge}
							</Badge>
						{/each}
					</div>
				</button>
			{/each}
		</Popover.Content>
	</Popover.Portal>
</Popover.Root>