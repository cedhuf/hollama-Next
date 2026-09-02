<script lang="ts">
	import { onMount } from 'svelte';

	import { BAND_COUNT, SILENCE, type Reading } from '$lib/audioReading';

	/**
	 * What the microphone is hearing, as bars.
	 *
	 * The counterpart of the orb: the orb is the voice answering and the bars are
	 * yours, so somebody can tell whose turn it is without reading a word. It also
	 * answers the oldest question a voice screen has, is it hearing me.
	 *
	 * Bars for the reason that usually argues against them: a level meter is what
	 * this is, and it should look like one.
	 */
	interface Props {
		/** Where the sound is, asked once per frame. The same contract as the orb. */
		sample?: () => Reading;
		/** Shut, in which case it draws a flat line and says so in its colour. */
		muted?: boolean;
		class?: string;
	}

	let { sample, muted = false, class: className = '' }: Props = $props();

	let canvas = $state<HTMLCanvasElement | null>(null);

	onMount(() => {
		const element = canvas;
		if (!element) return;
		const ctx = element.getContext('2d');
		if (!ctx) return;

		// Smoothed per bar, and asymmetrically: a bar that snapped down between two
		// syllables would flicker, and one that snapped up would miss the consonant.
		const heights = new Float32Array(BAND_COUNT);
		let frame = 0;

		const draw = () => {
			frame = requestAnimationFrame(draw);

			const ratio = Math.min(window.devicePixelRatio || 1, 2);
			const width = Math.round(element.clientWidth * ratio);
			const height = Math.round(element.clientHeight * ratio);
			if (element.width !== width || element.height !== height) {
				element.width = width;
				element.height = height;
			}

			const reading = muted ? SILENCE : (sample?.() ?? SILENCE);
			ctx.clearRect(0, 0, width, height);
			ctx.fillStyle = getComputedStyle(element).color;

			// Thin bars, widely spaced: a meter reads as an instrument at this ratio and as
			// a bar chart at anything fatter. It says "hearing you", quietly.
			const pitch = width / BAND_COUNT;
			const bar = Math.max(2, pitch * 0.3);
			const round = bar / 2;

			for (let i = 0; i < BAND_COUNT; i++) {
				// Curved, not scaled: a band spends almost all its time in the bottom fifth of
				// its range, so a linear meter is a flat line that twitches when somebody
				// shouts.
				//
				// A gentler root than the obvious one, which spends the whole range on the first
				// breath. This reaches half way at a conversational level and keeps the top for
				// somebody actually raising their voice.
				const target = Math.min(1, Math.pow((reading.bands[i] ?? 0) * 1.7, 0.8));
				heights[i] += (target - heights[i]) * (target > heights[i] ? 0.5 : 0.12);

				// Never nothing, and never quite full: a meter drawn to zero disappears, and a
				// row of dots is what says "on, and hearing silence". The ceiling short of the
				// edge keeps a loud syllable from looking like a bar out of room.
				const tall = Math.max(round * 2, heights[i] * height * 0.88);
				const top = (height - tall) / 2;

				const x = i * pitch + (pitch - bar) / 2;
				ctx.beginPath();
				// `roundRect` is recent enough that some browsers in use lack it, and a meter
				// that throws once a frame takes the screen with it.
				if (ctx.roundRect) ctx.roundRect(x, top, bar, tall, round);
				else ctx.rect(x, top, bar, tall);
				ctx.fill();
			}
		};

		frame = requestAnimationFrame(draw);
		return () => cancelAnimationFrame(frame);
	});
</script>

<canvas
	bind:this={canvas}
	class="{className} {muted ? 'text-shade-4' : 'text-accent'} transition-colors duration-300"
	aria-hidden="true"
></canvas>
