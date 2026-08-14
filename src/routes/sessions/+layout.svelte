<script lang="ts">
	import { type Snippet } from 'svelte';

	import { browser } from '$app/environment';
	import { page } from '$app/state';
	import { getLastUsedModels } from '$lib/chat';
	import { isServerMode } from '$lib/chat/endpoint';
	import { OllamaStrategy } from '$lib/chat/ollama';
	import { OpenAIStrategy } from '$lib/chat/openai';
	import RobotsNoIndex from '$lib/components/RobotsNoIndex.svelte';
	import { ConnectionType } from '$lib/connections';
	import { serversStore, settingsStore } from '$lib/localStorage';
	import { fetchProviders, providerModels } from '$lib/providers';
	import { type Model } from '$lib/settings';

	let { children }: { children: Snippet } = $props();

	// The landing page is frameless (like Library); a conversation sits in a card.
	const isHome = $derived(page.route.id === '/sessions');

	async function listModels(): Promise<Model[]> {
		// In server mode, models come from /api/providers (system: admin-curated
		// shared list; personal: live fetch performed server-side).
		if (isServerMode) {
			const { servers } = await fetchProviders();
			return providerModels(servers).sort((a, b) =>
				a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
			);
		}

		const models: Model[] = [];

		for (const server of $serversStore) {
			if (!server.isEnabled) continue;

			switch (server.connectionType) {
				case ConnectionType.Ollama:
					models.push(...(await new OllamaStrategy(server).getModels().catch(() => [])));
					break;
				case ConnectionType.OpenAI:
				case ConnectionType.OpenAICompatible:
				case ConnectionType.Anthropic:
				case ConnectionType.Infomaniak:
					models.push(...(await new OpenAIStrategy(server).getModels().catch(() => [])));
					break;
			}
		}

		return models.sort((a, b) => {
			const nameA = a.name;
			const nameB = b.name;
			return nameA.localeCompare(nameB, undefined, { sensitivity: 'base' });
		});
	}

	$effect(() => {
		if (browser) {
			listModels().then((models) => {
				$settingsStore.models = models;
				$settingsStore.lastUsedModels = getLastUsedModels();
			});
		}
	});
</script>

<RobotsNoIndex />

<div class="flex h-full w-full">
	{#if isHome}
		<!-- Frameless landing, like Library: no border, no card, the content reads as
		     sitting directly on the app canvas. It still needs a surface, because the
		     canvas can be a photograph. Tinted with the canvas' own colour, so mixing
		     it with itself gives that colour back exactly and the panel stays
		     invisible until there is a picture under it. -->
		<div
			class="app-panel [--surface-color:var(--color-shade-1)] lg:[--surface-color:var(--color-shade-2)] flex min-w-0 flex-1 flex-col surface-chrome lg:rounded-xl"
		>
			{@render children()}
		</div>
	{:else}
		<main class="app-panel flex min-w-0 flex-1 flex-col bg-shade-1 lg:rounded-xl lg:border">
			<div class="flex-1 overflow-auto">
				{@render children()}
			</div>
		</main>
	{/if}
</div>
