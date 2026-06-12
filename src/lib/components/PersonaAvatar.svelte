<script lang="ts">
	import { personaInitials, type Persona } from '$lib/personas';

	interface Props {
		persona: Pick<Persona, 'name' | 'avatarColor' | 'avatarImage'>;
		size?: number;
	}

	let { persona, size = 40 }: Props = $props();
</script>

<div
	class="flex shrink-0 items-center justify-center overflow-hidden rounded-full font-semibold text-shade-0"
	style="width:{size}px;height:{size}px;background-color:{persona.avatarColor};font-size:{Math.round(
		size * 0.38
	)}px"
>
	{#if persona.avatarImage}
		<img src={persona.avatarImage} alt={persona.name} class="h-full w-full object-cover" />
	{:else}
		{personaInitials(persona.name)}
	{/if}
</div>
