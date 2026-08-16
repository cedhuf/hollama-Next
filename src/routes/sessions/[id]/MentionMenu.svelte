<script lang="ts">
	import LL from '$i18n/i18n-svelte';
	import Kbd from '$lib/components/Kbd.svelte';
	import PersonaAvatar from '$lib/components/PersonaAvatar.svelte';
	import type { Persona } from '$lib/personas';

	/**
	 * Autocomplete for `@`, docked above the composer.
	 *
	 * The sibling of the slash menu, and deliberately its twin: same place, same
	 * keys, same shape. What is being chosen differs, so the row carries a face and
	 * a tagline rather than a name and a description, and that is the whole of the
	 * difference.
	 *
	 * Keyboard handling lives in the composer's `onkeydown`, next to the Enter
	 * handling it has to win against; this owns the list and the mouse.
	 */
	interface Props {
		personas: Persona[];
		/** Index of the highlighted row, owned by the composer. */
		selected: number;
		onPick: (persona: Persona) => void;
		onHover: (index: number) => void;
	}

	let { personas, selected, onPick, onHover }: Props = $props();
</script>

<div
	class="flex max-h-64 flex-col overflow-y-auto rounded-xl border border-shade-3 bg-shade-0 p-1.5 shadow-lg"
	role="listbox"
	aria-label={$LL.mentionPersona()}
>
	{#each personas as persona, i (persona.id)}
		<button
			type="button"
			role="option"
			aria-selected={i === selected}
			onclick={() => onPick(persona)}
			onmousemove={() => onHover(i)}
			class="flex items-center gap-2.5 rounded-md px-2 py-1.5 text-left transition-colors {i ===
			selected
				? 'bg-shade-1'
				: ''}"
		>
			<PersonaAvatar {persona} size={24} />
			<span class="shrink-0 text-sm text-active">{persona.name}</span>
			{#if persona.tagline}
				<span class="min-w-0 flex-1 truncate text-xs text-muted">{persona.tagline}</span>
			{/if}
		</button>
	{/each}

	<p class="flex items-center gap-1.5 px-2.5 pb-0.5 pt-1.5 text-[11px] text-muted">
		<Kbd>↑</Kbd><Kbd>↓</Kbd>
		<span>{$LL.searchNavigate()}</span>
		<Kbd>↵</Kbd>
		<span>{$LL.mentionInsert()}</span>
	</p>
</div>
