<script lang="ts">
	import { type Snippet } from 'svelte';

	import { browser } from '$app/environment';
	import { page } from '$app/state';
	import { getLastUsedModels } from '$lib/chat';
	import RobotsNoIndex from '$lib/components/RobotsNoIndex.svelte';
	import { settingsStore } from '$lib/localStorage';
	import { fetchProviders, providerModels } from '$lib/providerCatalogue';
	import { type Model } from '$lib/settings';

	let { children }: { children: Snippet } = $props();

	// The landing page is frameless (like Library); a conversation sits in a card.
	const isHome = $derived(page.route.id === '/sessions');

	/**
	 * The models on offer, from `/api/providers`: the admin's shared list, plus
	 * whatever a personal connection answers when the server asks it.
	 */
	async function listModels(): Promise<Model[]> {
		const { servers } = await fetchProviders();
		return providerModels(servers).sort((a, b) =>
			a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
		);
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
			class="app-panel surface-pane flex min-w-0 flex-1 flex-col [--surface-color:var(--color-shade-1)] lg:rounded-xl lg:[--surface-color:var(--color-shade-2)]"
		>
			{@render children()}
		</div>
	{:else}
		<!-- Built like the sidebar: the column carries one blur for everything in it,
		     the bar and the conversation are neighbours that each paint their own tint,
		     and only the composer still floats, keeping the blur that lets a message be
		     glimpsed passing under it.

		     `relative` on purpose rather than by accident: the composer positions
		     against this box, and until now it was a `backdrop-filter` that happened to
		     make one. Turn the filter off and the composer would have gone looking for
		     its box somewhere else.

		     `overflow-hidden` for the same reason the sidebar has it: this box draws the
		     border and the rounded corners, its children paint the fills, and without a
		     clip a square fill simply hangs out past a round outline. -->
		<main
			class="app-panel relative flex min-w-0 flex-1 flex-col overflow-hidden lg:rounded-xl lg:border"
		>
			<div class="flex-1 overflow-auto">
				{@render children()}
			</div>
		</main>
	{/if}
</div>
