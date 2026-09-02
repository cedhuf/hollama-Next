<script lang="ts">
	import { personaGlyph } from '$lib/personaGlyphs';
	import { personaInitials, type Persona } from '$lib/personas';

	interface Props {
		persona: Pick<Persona, 'name' | 'avatarColor' | 'avatarImage' | 'avatarGlyph'>;
		size?: number;
	}

	let { persona, size = 40 }: Props = $props();

	const glyph = $derived(personaGlyph(persona.avatarGlyph));
</script>

<!-- Three faces, in the order they win: an uploaded picture, a glyph the app
     draws, the initials. The picture goes first because someone chose it.

     `{@html}` is safe here: what it renders is never the stored value, it is the
     entry `personaGlyph` found under that name in our own table. -->
<div
	class="text-shade-0 flex shrink-0 items-center justify-center overflow-hidden rounded-full font-semibold"
	style="width:{size}px;height:{size}px;background-color:{persona.avatarColor};font-size:{Math.round(
		size * 0.38
	)}px"
>
	{#if persona.avatarImage}
		<img src={persona.avatarImage} alt={persona.name} class="h-full w-full object-cover" />
	{:else if glyph}
		<svg
			viewBox="0 0 64 64"
			class="h-full w-full"
			style="--persona-glyph-cut:{persona.avatarColor}"
			role="presentation"
		>
			<!-- Never the stored value: `personaGlyph` returns an entry of our own table or
			     nothing, so a catalogue has no way to supply markup of its own. -->
			<!-- eslint-disable-next-line svelte/no-at-html-tags -->
			{@html glyph.body}
		</svg>
	{:else}
		{personaInitials(persona.name)}
	{/if}
</div>
