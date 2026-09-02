<script lang="ts">
	import { SILENCE, type Reading } from '$lib/audioReading';

	/**
	 * The app's voice, given a body.
	 *
	 * Nothing is drawn: blurred lumps blend on top of each other and the browser
	 * composites them, so the per-frame work is writing six custom properties.
	 *
	 * The silhouette is made by the lumps and never by a mask, which is the
	 * load-bearing decision: a radial mask gives a perfect ring that reads as a
	 * machined part. `--open` pushes the lumps out instead, and the blur welds them
	 * back into a ring that is never quite round.
	 *
	 * So the four states are positions on one axis rather than four shapes:
	 *
	 *   idle       almost closed, small, drained of colour
	 *   listening  wide open, the core faded, larger than at rest
	 *   thinking   drawn back in, hue turned, crossed by an arc
	 *   speaking   barely open, beating on the voice
	 *
	 * Shape rather than speed: a blur this wide destroys the detail that would
	 * carry a gesture, and a form is read before a movement.
	 */

	interface Props {
		/**
		 * Where the sound is, asked once per frame. A function rather than a value:
		 * pushing sixty readings a second through reactive state would wake the whole
		 * page to animate one shape.
		 */
		sample?: () => Reading;
		/**
		 * `thinking` is the one state with no sound at all, and it must not look like
		 * silence: a shape that goes still while a model works reads as a crash. It is
		 * the state that gets the arc.
		 */
		phase?: 'idle' | 'listening' | 'thinking' | 'speaking';
		/**
		 * How many lumps make the body.
		 *
		 * Five is the fewest that closes into a crown; below it they read one by one,
		 * which is a different object. More is smoother and costs one more composited
		 * layer each.
		 */
		lumps?: number;
		class?: string;
	}

	let { sample, phase = 'idle', lumps = 5, class: className = '' }: Props = $props();

	/**
	 * What each state is, and `open` is the only field that carries it.
	 *
	 * The rest modulates. `breath` is the period of the whole body's respiration,
	 * and it belongs to the state rather than being a constant: it says which state
	 * this is faster than any colour, from across a room.
	 */
	interface Shape {
		/** How far the lumps sit from the centre, and the only field carrying state. */
		open: number;
		/** The body's overall size. */
		reach: number;
		/** Whether the arc is there at all. */
		sweep: number;
		/** The period of one breath, in seconds. */
		breath: number;
		bright: number;
		speed: number;
	}

	const STATES: Record<NonNullable<Props['phase']>, Shape> = {
		idle: { open: 0.12, reach: 0.78, sweep: 0, breath: 7, bright: 0.75, speed: 0.35 },
		listening: { open: 1, reach: 1, sweep: 0, breath: 3.4, bright: 1.15, speed: 0.7 },
		thinking: { open: 0.72, reach: 0.86, sweep: 1, breath: 2.4, bright: 1, speed: 1.5 },
		speaking: { open: 0.3, reach: 1.02, sweep: 0, breath: 4, bright: 1.25, speed: 2.2 }
	};

	/**
	 * Radii, sizes and periods that do not divide into each other.
	 *
	 * Equal orbits keep the lumps in formation and the crown turns like a cogwheel;
	 * shared periods bring the figure back to its starting point every lap and the
	 * eye catches the loop within seconds. Fixed here rather than random, so a
	 * reload draws the same object.
	 */
	const LUMPS = [
		{ k: 0.72, size: 34, ratio: 1 },
		{ k: 1.0, size: 48, ratio: 1.31 },
		{ k: 0.86, size: 41, ratio: 0.83 },
		{ k: 1.14, size: 34, ratio: 1.17 },
		{ k: 0.79, size: 55, ratio: 0.71 },
		{ k: 1.07, size: 41, ratio: 1.44 },
		{ k: 0.93, size: 34, ratio: 1.09 },
		{ k: 1.21, size: 48, ratio: 0.77 },
		{ k: 0.65, size: 41, ratio: 1.53 }
	];

	const body = $derived(LUMPS.slice(0, Math.max(1, Math.min(lumps, LUMPS.length))));

	let bloom = $state<HTMLDivElement | null>(null);

	$effect(() => {
		const element = bloom;
		if (!element) return;

		// The values actually drawn, which reach for the target rather than jumping
		// to it. A state that changes should be crossed, not substituted.
		const now: Shape = { ...STATES.idle };

		/**
		 * The level, with an asymmetric envelope: fast up, slow down.
		 *
		 * A symmetric follower gives a level meter, whose shape sticks to the signal
		 * and reads as an instrument. A quick attack and a long release give
		 * inertia, which is to say mass, which is to say something with a body.
		 *
		 * `slow` is the same value followed slower still, for the halo: it arrives
		 * after the body, and that lateness is what makes it read as an atmosphere
		 * around a thing rather than the same thing enlarged.
		 */
		let fast = 0;
		let slow = 0;
		let clock = 0;
		let last = performance.now();
		let frame = 0;

		// A twentieth of the body's width, which is the ratio the shape was tuned at.
		const measure = () => {
			const width = element.getBoundingClientRect().width;
			if (width) element.style.setProperty('--soft', (width / 20).toFixed(2));
		};
		measure();
		const watching = new ResizeObserver(measure);
		watching.observe(element);

		const tick = (stamp: number) => {
			frame = requestAnimationFrame(tick);

			const dt = Math.min((stamp - last) / 1000, 0.05);
			last = stamp;

			const level = (sample?.() ?? SILENCE).level;
			fast += (level - fast) * (level > fast ? 0.4 : 0.045);
			slow += (fast - slow) * 0.03;

			const target = STATES[phase];
			for (const key of ['open', 'reach', 'sweep', 'bright', 'speed'] as const) {
				let wanted: number = target[key];
				if (key === 'reach') wanted += fast * 0.18;
				if (key === 'speed') wanted += fast * 1.2;
				// The morphology is crossed more slowly than the rest: it is the one
				// movement that has to be seen happening rather than switched.
				now[key] += (wanted - now[key]) * Math.min(1, dt * (key === 'open' ? 2.2 : 6));
			}

			clock += dt;

			element.style.setProperty('--open', now.open.toFixed(3));
			element.style.setProperty('--reach', now.reach.toFixed(3));
			element.style.setProperty('--sweep', now.sweep.toFixed(3));
			element.style.setProperty('--glow', (0.45 + now.bright * 0.42).toFixed(2));
			element.style.setProperty('--churn', `${(9 / (0.5 + now.speed)).toFixed(2)}s`);
			// Written rather than animated in CSS: the period belongs to the state, and
			// an animation whose duration changes restarts from its first frame.
			const breath = (Math.sin((clock * 2 * Math.PI) / target.breath) + 1) / 2;
			element.style.setProperty('--breathe', (0.97 + breath * 0.06).toFixed(4));
			element.style.setProperty('--lag', (0.94 + slow * 0.2 + now.reach * 0.1).toFixed(3));
		};

		frame = requestAnimationFrame(tick);
		return () => {
			cancelAnimationFrame(frame);
			watching.disconnect();
		};
	});
</script>

<div bind:this={bloom} class="bloom {className}" data-state={phase} aria-hidden="true">
	<div class="halo"></div>
	<div class="body">
		<div class="fill"></div>
		{#each body as lump, index (index)}
			<div
				class="lump"
				style="--from: {Math.round(
					(index / body.length) * 360
				)}deg; --k: {lump.k}; --size: {lump.size}%; --ratio: {lump.ratio}; --offset: calc(var(--churn) * {(
					-index / body.length
				).toFixed(3)})"
			></div>
		{/each}
	</div>
	<div class="arc"></div>
</div>

<style lang="postcss">
	.bloom {
		position: relative;
		/*
		 * Without it the screen blending below happens against the page rather than
		 * between the lumps, and the body turns into a flat wash.
		 */
		isolation: isolate;
		--tint: var(--color-accent);
		--open: 0;
		--spread: 18;
		--reach: 1;
		--glow: 1;
		--sweep: 0;
		--lag: 1;
		--churn: 9s;
		/* The crown's radius, read by the lumps and by the arc. Declared here because
		   a property set on the body would not be visible from its sibling. */
		--ring: calc(var(--open) * var(--spread) * 1%);
		/* `--soft` is measured rather than declared: the same shape is a screen-wide
		   body on the voice page and a thumbnail on a card, and a blur that does not
		   scale with it is either a smear or a hard edge. A container query cannot do
		   it, since an element is never its own container. */
		filter: blur(calc(var(--soft, 8) * 1px)) contrast(1.4) saturate(1.2);
		opacity: var(--glow);
	}

	/*
	 * The tint per state, and it is a tint rather than a brightness.
	 *
	 * Two states that differ only in lightness are the same state at a metre. Two
	 * hues are not. Derived from the app's accent rather than chosen, so every
	 * theme gets its own version of this and none of them gets a colour it never
	 * asked for.
	 */
	.bloom[data-state='idle'] {
		--tint: oklch(from var(--color-accent) l calc(c * 0.22) h);
	}

	.bloom[data-state='thinking'] {
		--tint: oklch(from var(--color-accent) l calc(c * 0.85) calc(h + 150));
	}

	.body {
		position: absolute;
		inset: 0;
		transform: scale(calc(var(--reach) * var(--breathe, 1)));
		transform-origin: 50% 50%;
	}

	/*
	 * The core, which fades as the crown opens.
	 *
	 * It never goes out entirely: a floor of light at the centre is what stops the
	 * ring reading as a hole, and a hole is ugly.
	 */
	.fill {
		position: absolute;
		inset: 0;
		border-radius: 50%;
		opacity: calc(1 - var(--open) * 0.78);
		transform: scale(calc(1 - var(--open) * 0.25));
		background: radial-gradient(
			circle at 50% 50%,
			color-mix(in srgb, var(--tint) 90%, white) 0%,
			color-mix(in srgb, var(--tint) 60%, transparent) 42%,
			color-mix(in srgb, var(--tint) 24%, transparent) 70%
		);
	}

	/* The lumps carry everything: the matter, the life and the outline. */
	.lump {
		position: absolute;
		inset: 0;
		border-radius: 50%;
		mix-blend-mode: screen;
		background: radial-gradient(
			circle at 50% 50%,
			color-mix(in srgb, var(--tint) 92%, white) 0%,
			color-mix(in srgb, var(--tint) 58%, transparent) calc(var(--size) * 0.55),
			transparent var(--size)
		);
		transform-origin: 50% 50%;
		animation: drift calc(var(--churn) * var(--ratio)) ease-in-out infinite;
		animation-delay: var(--offset);
	}

	@keyframes drift {
		0%,
		100% {
			transform: rotate(var(--from)) translateX(calc(var(--ring) * var(--k))) scale(0.82);
		}
		50% {
			transform: rotate(calc(var(--from) + 200deg)) translateX(calc(var(--ring) * var(--k) * 0.72))
				scale(1.1);
		}
	}

	/*
	 * The arc, and it exists only while something is being worked out.
	 *
	 * A conic sweep bounded to the crown. Its mask is deliberately wide and soft so
	 * it slides over the lumps instead of laying a rail across them. Everywhere
	 * else `--sweep` is nought and it costs a composited layer and nothing more.
	 */
	.arc {
		position: absolute;
		inset: 0;
		transform: scale(calc(var(--reach) * var(--breathe, 1)));
		opacity: var(--sweep);
		background: conic-gradient(
			from 0deg,
			transparent 0deg,
			color-mix(in srgb, var(--tint) 85%, white) 60deg,
			transparent 150deg,
			transparent 360deg
		);
		-webkit-mask-image: radial-gradient(
			circle at 50% 50%,
			transparent 0,
			#000 calc(var(--ring) * 0.8),
			#000 calc(var(--ring) + 16%),
			transparent calc(var(--ring) + 32%)
		);
		mask-image: radial-gradient(
			circle at 50% 50%,
			transparent 0,
			#000 calc(var(--ring) * 0.8),
			#000 calc(var(--ring) + 16%),
			transparent calc(var(--ring) + 32%)
		);
		animation: sweep 2.6s linear infinite;
		transition: opacity 500ms ease;
	}

	@keyframes sweep {
		to {
			rotate: 360deg;
		}
	}

	/* The atmosphere, which follows the body late. The lateness is the whole point:
	   it is what makes this read as something around a thing. */
	.halo {
		position: absolute;
		inset: -14%;
		border-radius: 50%;
		background: radial-gradient(
			circle at 50% 50%,
			color-mix(in srgb, var(--tint) 26%, transparent) 0%,
			color-mix(in srgb, var(--tint) 9%, transparent) 45%,
			transparent 70%
		);
		transform: scale(var(--lag));
	}

	/* Still, but not blank: the shape keeps its state colour and its opening, so
	   somebody who has asked for less motion still learns what is happening. */
	@media (prefers-reduced-motion: reduce) {
		.lump,
		.arc {
			animation: none;
		}
	}
</style>
