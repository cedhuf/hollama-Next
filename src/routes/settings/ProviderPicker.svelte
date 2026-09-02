<script lang="ts">
	import { Search } from '@lucide/svelte';

	import LL from '$i18n/i18n-svelte';
	import { PROVIDERS, type ConnectionType } from '$lib/connections';
	import { describeProvider } from '$lib/providers';

	/**
	 * Which provider a new connection talks to.
	 *
	 * A card each rather than a row of chips, and everything on it comes out of the
	 * descriptor, so a file added under `$lib/providers` shows up with its identity
	 * already drawn.
	 *
	 * That is the part that has to scale: five chips read as a row, twenty-five as a
	 * wall. The search box turns up on its own once the list needs it.
	 */
	interface Props {
		onSelect: (type: ConnectionType) => void;
	}

	let { onSelect }: Props = $props();

	let query = $state('');

	/** Past this many, scanning stops working and the list needs a way in. */
	const SEARCHABLE_FROM = 8;

	const entries = $derived(
		PROVIDERS.map((provider) => {
			const descriptor = describeProvider(provider.type);
			return {
				provider,
				color: descriptor.badge.color,
				/** The catch-all, which is an answer rather than a brand. */
				isFallback: !descriptor.identified && !descriptor.requiresApiKey,
				needs: provider.requiresApiKey
					? $LL.providerNeedsKey()
					: provider.identified
						? $LL.providerNoKey()
						: $LL.providerOwnEndpoint()
			};
		})
	);

	const shown = $derived(
		query.trim()
			? entries.filter((entry) =>
					entry.provider.name.toLowerCase().includes(query.trim().toLowerCase())
				)
			: entries
	);
</script>

{#if entries.length >= SEARCHABLE_FROM}
	<div class="relative">
		<Search
			class="text-muted pointer-events-none absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2"
		/>
		<input
			class="settings-field pl-8"
			type="search"
			bind:value={query}
			placeholder={$LL.searchProviders()}
			aria-label={$LL.searchProviders()}
		/>
	</div>
{/if}

<div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
	{#each shown as entry (entry.provider.type)}
		<button
			type="button"
			onclick={() => onSelect(entry.provider.type)}
			class="hover:border-accent focus-visible:border-accent flex items-center gap-2.5 rounded-lg border p-2.5 text-left transition-colors {entry.isFallback
				? 'border-shade-4 border-dashed'
				: 'border-shade-3'}"
		>
			<!-- The connection's own colour, the same its models wear in every picker, so
			     the card and the connection it creates are recognisably the same thing. -->
			<span
				class="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-sm font-medium"
				style="background-color: color-mix(in srgb, {entry.color} 16%, transparent); color: {entry.color}"
				aria-hidden="true"
			>
				{entry.provider.name.slice(0, 1)}
			</span>
			<span class="flex min-w-0 flex-col">
				<span class="text-active truncate text-sm">{entry.provider.name}</span>
				<span class="text-muted truncate text-xs">{entry.needs}</span>
			</span>
		</button>
	{/each}
</div>

{#if !shown.length}
	<p class="text-muted text-xs">{$LL.searchEmpty()}</p>
{/if}
