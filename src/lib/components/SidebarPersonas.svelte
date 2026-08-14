<script lang="ts">
	import { ChevronDown } from '@lucide/svelte';

	import LL from '$i18n/i18n-svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { settingsStore } from '$lib/localStorage';
	import { launchPersona, type Persona } from '$lib/personas';

	import PersonaAvatar from './PersonaAvatar.svelte';

	interface Props {
		personas: Persona[];
		/**
		 * Two presentations of one list, never both at once: a named grid, or the row
		 * of avatars the compact header asks for. Both hold the same place above the
		 * conversations. What a launcher does, and what makes it look active, is
		 * written once either way.
		 */
		shape: 'grid' | 'strip';
		/** Grid only. A search is running, so the section opens whatever the toggle last said. */
		forceOpen?: boolean;
	}

	let { personas, shape, forceOpen = false }: Props = $props();

	let sectionOpen = $state(true);
	const open = $derived(sectionOpen || forceOpen);

	const pathname = $derived(page.url.pathname);
	const isActive = (persona: Persona) =>
		!!persona.sessionId && pathname.includes(persona.sessionId);

	/**
	 * Balanced columns: fill rows evenly (4→4, 6→3, 5→3…), capped at 4 so the
	 * avatars stay a reasonable size.
	 */
	const columns = $derived.by(() => {
		const n = personas.length;
		if (n <= 1) return 1;
		const rows = Math.ceil(n / 4);
		return Math.ceil(n / rows);
	});

	function launch(persona: Persona) {
		goto(resolve('/sessions/[id]', { id: launchPersona(persona, $settingsStore.models) }));
	}
</script>

{#if personas.length > 0}
	{#if shape === 'grid'}
		<div class="px-2 py-2">
			<button
				type="button"
				onclick={() => (sectionOpen = !sectionOpen)}
				class="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-accent transition-colors hover:bg-shade-0"
			>
				<span>{$LL.personas()} · {personas.length}</span>
				<ChevronDown class="h-3.5 w-3.5 transition-transform {open ? '' : '-rotate-90'}" />
			</button>
			{#if open}
				<!-- iOS Messages-style grid: avatars in balanced rows, partial rows centred. -->
				<div class="flex flex-wrap justify-center gap-1 pb-1 pt-1">
					{#each personas as persona (persona.id)}
						<button
							type="button"
							onclick={() => launch(persona)}
							style="flex: 0 0 calc(100% / {columns} - 0.25rem)"
							class="flex flex-col items-center gap-1.5 rounded-xl px-1 py-2 transition-colors hover:bg-shade-0"
							title={persona.tagline || persona.name}
						>
							<span
								class="relative inline-flex rounded-full {isActive(persona)
									? 'ring-2 ring-accent ring-offset-2 ring-offset-shade-1'
									: ''}"
							>
								<PersonaAvatar {persona} size={44} />
							</span>
							<span
								class="w-full truncate text-center text-xs {isActive(persona)
									? 'font-medium text-active'
									: 'text-muted'}"
							>
								{persona.name}
							</span>
						</button>
					{/each}
				</div>
			{/if}
		</div>
	{:else}
		<!-- Spread rather than stacked to the left: four avatars bunched in a corner
		     read as a leftover, the same four spaced across the width read as a row.
		     `justify-evenly` gives way to scrolling once they no longer fit, which is
		     the point at which even spacing stops being possible.
		     `pt-1` is not decoration: the active ring is drawn outside the avatar, and
		     asking for horizontal overflow clips the vertical one too. -->
		<div class="flex justify-evenly gap-1.5 overflow-x-auto px-3 pb-2 pt-1">
			{#each personas as persona (persona.id)}
				<button
					type="button"
					onclick={() => launch(persona)}
					title={persona.name}
					aria-label={persona.name}
					class="shrink-0 rounded-full transition-transform hover:scale-105 {isActive(persona)
						? 'ring-2 ring-accent ring-offset-2 ring-offset-shade-1'
						: ''}"
				>
					<PersonaAvatar {persona} size={28} />
				</button>
			{/each}
		</div>
	{/if}
{/if}
