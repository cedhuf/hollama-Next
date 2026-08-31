<script lang="ts">
	import { onMount } from 'svelte';

	import { BAND_COUNT, SILENCE, type Reading } from '$lib/audioReading';

	/**
	 * What the microphone is hearing, as bars.
	 *
	 * The counterpart of the aura, and different on purpose. The aura is the voice
	 * answering and the bars are yours, and two visuals for two speakers is what
	 * lets somebody tell at a glance whose turn it is without reading a word.
	 *
	 * It also answers the oldest question a voice screen has: is it hearing me. A
	 * room it cannot hear draws a flat line, and that says "your microphone is not
	 * reaching me" before anybody has spoken a whole sentence into nothing. No
	 * status text does that as quickly.
	 *
	 * Bars rather than another body, and the reason is the one that usually argues
	 * against them: they read as equipment. A level meter is exactly what this is,
	 * and it should look like one.
	 */
	interface Props {
		/** Where the sound is, asked once per frame. The same contract as the aura. */
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
		// syllables would flicker, and one that snapped up would miss the consonant
		// that made it move.
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

			// A gap of a third of the pitch, which is wide enough to read as separate
			// bars at arm's length and narrow enough not to look like a comb.
			const pitch = width / BAND_COUNT;
			const bar = pitch * 0.5;
			const round = Math.min(bar / 2, height / 2);

			for (let i = 0; i < BAND_COUNT; i++) {
				// Curved, not scaled. A band spends almost all of its time in the
				// bottom fifth of its range, so a linear meter is a flat line that
				// twitches when somebody shouts, which is what this was. The root
				// spends the quiet end of the range generously and still has somewhere
				// to go when a voice is actually loud.
				const target = Math.min(1, Math.pow((reading.bands[i] ?? 0) * 2.4, 0.55));
				heights[i] += (target - heights[i]) * (target > heights[i] ? 0.5 : 0.12);

				// Never nothing: a meter drawn to zero height disappears, and a row of
				// dots is what says "on, and hearing silence" rather than "off".
				const tall = Math.max(round * 2, heights[i] * height);
				const top = (height - tall) / 2;

				const x = i * pitch + (pitch - bar) / 2;
				ctx.beginPath();
				// `roundRect` is recent enough that some browsers in use do not have it,
				// and a meter that throws once a frame takes the screen with it.
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
