<script lang="ts">
	import { onMount } from 'svelte';

	import { BAND_COUNT, SILENCE, type Reading } from '$lib/audioReading';

	/**
	 * The app's voice, given a body.
	 *
	 * Drawn rather than declared, and the reason is the one thing the CSS version
	 * could never do. Three blurred discs on `@keyframes` orbits look alive, but
	 * they are alive on a timer: they cannot punch on a consonant, because nothing
	 * about them has ever heard the sound. This one is handed a reading every frame
	 * and shaped by it.
	 *
	 * A closed curve in polar coordinates, not a ring of bars. Bars are the shape
	 * every audio visualiser has had since the nineties, and they read as equipment.
	 * A body whose outline swells where the energy is reads as something speaking.
	 *
	 * Two layers, and the contrast between them is the whole effect. A soft filled
	 * core carries the slow envelope, so the shape has mass. A crisp rim on top
	 * carries the spectrum with a fast attack, so it has edge. Softness alone is
	 * fog; an edge alone is a diagram.
	 */
	interface Props {
		/**
		 * Where the sound is, asked once per frame.
		 *
		 * A function rather than a value: this redraws sixty times a second, and
		 * pushing sixty readings a second through reactive state would wake the whole
		 * page to animate one canvas. The caller decides which end of the conversation
		 * it points at.
		 */
		sample?: () => Reading;
		/**
		 * What is happening, for the parts no reading can express.
		 *
		 * `thinking` is the one state with no sound at all, and it must not look like
		 * silence: a shape that goes still while a model is working reads as an app
		 * that has crashed.
		 */
		phase?: 'idle' | 'listening' | 'thinking' | 'speaking';
		class?: string;
		/**
		 * Anything the caller wants on the element, which in practice is its colour.
		 *
		 * The drawing reads `color` back off this element every frame, so a caller
		 * that wants a different hue sets one here and needs no property of its own.
		 * That is also what lets a colour be computed rather than named: a state on
		 * the voice screen turns the accent's hue instead of picking a second token.
		 */
		style?: string;
	}

	// `phase` rather than `state`: a local binding by that name makes every `$state`
	// in the file read as a store subscription, which the compiler rightly refuses.
	let { sample, phase = 'idle', class: className = '', style = '' }: Props = $props();

	let canvas: HTMLCanvasElement | undefined = $state();

	/**
	 * How fast a band rises and how slowly it falls.
	 *
	 * Not symmetrical, and that asymmetry is the entire brief. Rising instantly is
	 * what makes a plosive land as a hit rather than as a swell; falling slowly is
	 * what stops the shape flickering between syllables. Matched attack and release
	 * gives you a shape that vibrates, which reads as noise rather than as speech.
	 */
	const ATTACK = 1;
	const RELEASE_SPEAKING = 0.86;
	const RELEASE_LISTENING = 0.93;

	onMount(() => {
		const element = canvas;
		if (!element) return;

		const context = element.getContext('2d');
		if (!context) return;

		const calm = window.matchMedia('(prefers-reduced-motion: reduce)');

		/** Smoothed per band, kept between frames: this is where the release lives. */
		const held = new Array<number>(BAND_COUNT).fill(0);
		let envelope = 0;
		let turn = 0;

		let frame = 0;
		let width = 0;
		let height = 0;

		/**
		 * Redrawn at the device's own resolution.
		 *
		 * A canvas sized in CSS pixels on a phone is a canvas at a third of the
		 * resolution of everything around it, and on a shape made of curves that is
		 * immediately visible.
		 */
		const resize = () => {
			const ratio = Math.min(window.devicePixelRatio || 1, 3);
			const box = element.getBoundingClientRect();
			width = box.width;
			height = box.height;
			element.width = Math.round(width * ratio);
			element.height = Math.round(height * ratio);
			context.setTransform(ratio, 0, 0, ratio, 0, 0);
		};

		const observer = new ResizeObserver(resize);
		observer.observe(element);
		resize();

		/**
		 * The colour, read off the element rather than passed in.
		 *
		 * A canvas cannot use a custom property, so the value has to be resolved. The
		 * declaration is live, so it is fetched once and read every frame: the theme
		 * changing and the caller changing the element's own colour both arrive with
		 * no plumbing at all, which is what lets the page say "this conversation is
		 * engaged" by swapping one class.
		 */
		const style = getComputedStyle(element);

		const draw = (now: number) => {
			frame = requestAnimationFrame(draw);
			if (document.hidden || !width) return;

			const accent = style.color || 'rgb(29 158 117)';
			const reading = sample?.() ?? SILENCE;
			const quiet = calm.matches;
			const speaking = phase === 'speaking';

			// Fast up, slow down, and slower down while listening: a room's level
			// wanders, and a body that chased it would fidget.
			const release = speaking ? RELEASE_SPEAKING : RELEASE_LISTENING;
			for (let band = 0; band < BAND_COUNT; band++) {
				const value = reading.bands[band] ?? 0;
				held[band] = value > held[band] ? value * ATTACK : held[band] * release;
			}
			envelope = reading.level > envelope ? reading.level : envelope * 0.94;

			// The idle drift, which is what the CSS version was made of and is still
			// worth keeping: an outline that never quite repeats is what makes a shape
			// read as alive rather than as a graphic.
			turn = quiet ? 0 : now / 1000;

			context.clearRect(0, 0, width, height);

			const cx = width / 2;
			const cy = height / 2;
			const base = Math.min(width, height) * 0.32;

			/**
			 * The radius at one angle.
			 *
			 * Three slow harmonics for the body, so it is never a circle, plus the
			 * spectrum wrapped twice around: once round would put the loud low bands
			 * all on one side and leave the shape lopsided for the whole sentence.
			 */
			const radius = (angle: number, reach: number) => {
				const drift =
					Math.sin(angle * 2 + turn * 0.7) * 0.045 +
					Math.sin(angle * 3 - turn * 0.5) * 0.03 +
					Math.sin(angle * 5 + turn * 0.9) * 0.02;

				const slot = ((angle / Math.PI) * BAND_COUNT) % BAND_COUNT;
				const low = held[Math.floor(slot) % BAND_COUNT];
				const high = held[(Math.floor(slot) + 1) % BAND_COUNT];
				const between = slot - Math.floor(slot);
				// Cosine rather than linear, so bands meet smoothly and the outline has
				// no corners where two of them join.
				const spectrum = low + ((high - low) * (1 - Math.cos(between * Math.PI))) / 2;

				return base * (1 + drift + envelope * 0.12 + spectrum * reach);
			};

			const trace = (reach: number) => {
				context.beginPath();
				const steps = 96;
				for (let step = 0; step <= steps; step++) {
					const angle = (step / steps) * Math.PI * 2;
					const r = radius(angle, reach);
					const x = cx + Math.cos(angle) * r;
					const y = cy + Math.sin(angle) * r;
					if (step === 0) context.moveTo(x, y);
					else context.lineTo(x, y);
				}
				context.closePath();
			};

			// The body: soft, wide, and reaching less than the rim, so the edge always
			// runs outside the mass rather than cutting through it.
			// Named for what it is. A property called `glow` once shadowed this and
			// turned every alpha into NaN, which drew the orb at full opacity
			// everywhere and looked like a colour change.
			const body = context.createRadialGradient(
				cx - base * 0.3,
				cy - base * 0.3,
				base * 0.1,
				cx,
				cy,
				base * 1.7
			);
			body.addColorStop(0, accent);
			body.addColorStop(0.55, accent);
			body.addColorStop(1, 'transparent');

			context.save();
			context.globalAlpha = phase === 'idle' ? 0.24 : 0.4;
			context.filter = quiet ? 'none' : `blur(${Math.max(6, base * 0.16)}px)`;
			context.fillStyle = body;
			trace(speaking ? 0.22 : 0.14);
			context.fill();
			context.restore();

			// The rim: thin, bright, and the only thing on screen with a fast attack.
			context.save();
			context.globalAlpha = speaking ? 0.95 : 0.6;
			context.lineWidth = speaking ? 2 : 1.25;
			context.strokeStyle = accent;
			if (!quiet) {
				context.shadowBlur = speaking ? 18 : 8;
				context.shadowColor = accent;
			}
			trace(speaking ? 0.42 : 0.18);
			context.stroke();
			context.restore();

			// Thinking has no sound to read, so it gets the one thing the others do not:
			// a mark going round. Deliberately unlike both, because a shape that merely
			// went quiet would read as an app that had stopped.
			if (phase === 'thinking' && !quiet) {
				const angle = now / 420;
				context.save();
				context.globalAlpha = 0.9;
				context.fillStyle = accent;
				context.beginPath();
				context.arc(
					cx + Math.cos(angle) * base * 1.25,
					cy + Math.sin(angle) * base * 1.25,
					Math.max(2, base * 0.05),
					0,
					Math.PI * 2
				);
				context.fill();
				context.restore();
			}
		};

		frame = requestAnimationFrame(draw);

		return () => {
			cancelAnimationFrame(frame);
			observer.disconnect();
		};
	});
</script>

<!-- The text colour is not decoration here, it is the input: the drawing reads it
     back off this element every frame. That is how the orb follows the theme, and
     how a caller says "engaged" by handing it a different colour class. -->
<canvas bind:this={canvas} class="block {className}" {style} aria-hidden="true"></canvas>
