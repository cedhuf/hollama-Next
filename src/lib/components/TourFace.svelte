<script lang="ts">
	import type { TourPersona } from '$lib/tourCast';

	interface Props {
		persona: TourPersona;
		size?: number;
	}

	let { persona, size = 40 }: Props = $props();
</script>

<!-- `{@html}` is safe here for the same reason it is in `PersonaAvatar`: what it
     renders is never a stored or fetched value, it is the markup of one of our own
     entries in `TOUR_CAST`, which nothing outside this repository can add to. -->
<span
	class="flex shrink-0 items-center justify-center overflow-hidden rounded-full text-shade-0"
	style="width:{size}px;height:{size}px;background-color:{persona.color};--tour-face-cut:{persona.color}"
>
	<svg viewBox="0 0 64 64" class="h-full w-full" role="presentation">
		<!-- eslint-disable-next-line svelte/no-at-html-tags -->
		{@html persona.face}
	</svg>
</span>
