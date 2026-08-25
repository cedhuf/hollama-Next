<script lang="ts">
	/**
	 * The app's voice, given a body.
	 *
	 * Three blurred discs of the accent, each on its own orbit, over a soft core.
	 * A single gradient would have been cheaper and would have looked like a
	 * gradient: what makes this read as something alive is that its outline never
	 * stops moving and never repeats.
	 *
	 * Two sizes of the same object rather than two objects: small it is an
	 * illustration on a card, large it is the whole of the feedback on the voice
	 * screen, and they have to be recognisably the same thing.
	 */
	interface Props {
		/** Awake: faster orbits and a firmer body, for the moment it is listening. */
		active?: boolean;
		class?: string;
	}

	let { active = false, class: className = '' }: Props = $props();
</script>

<div class="orb relative {className}" class:orb--active={active} aria-hidden="true">
	<span class="orb__blob orb__blob--a"></span>
	<span class="orb__blob orb__blob--b"></span>
	<span class="orb__blob orb__blob--c"></span>
	<span class="orb__core"></span>
</div>

<style lang="postcss">
	.orb__blob,
	.orb__core {
		position: absolute;
		border-radius: 9999px;
	}

	.orb__core {
		inset: 18%;
		background: radial-gradient(
			circle at 35% 30%,
			color-mix(in srgb, var(--color-accent) 85%, white),
			color-mix(in srgb, var(--color-accent) 55%, transparent) 60%,
			transparent 72%
		);
		filter: blur(4px);
		animation: orb-breathe 5s ease-in-out infinite alternate;
	}

	.orb__blob {
		inset: 8%;
		/* In `em`, so the same component blurs proportionally at either size: a
		   26 pixel blur on a 56 pixel disc is fog. */
		filter: blur(0.22em);
		opacity: 0.75;
		animation-name: orb-drift;
		animation-timing-function: ease-in-out;
		animation-iteration-count: infinite;
		animation-direction: alternate;
	}

	.orb__blob--a {
		background: color-mix(in srgb, var(--color-accent) 70%, transparent);
		animation-duration: 7s;
	}

	.orb__blob--b {
		background: color-mix(in srgb, var(--color-accent) 45%, white);
		animation-duration: 11s;
		animation-delay: -3s;
	}

	.orb__blob--c {
		background: color-mix(in srgb, var(--color-accent) 30%, transparent);
		animation-duration: 9s;
		animation-delay: -6s;
	}

	/* Awake is the same body faster and firmer, rather than a second animation that
	   would have to agree with the first. */
	.orb--active .orb__blob {
		animation-duration: 3.5s;
		opacity: 0.9;
	}

	.orb--active .orb__core {
		animation-duration: 1.8s;
	}

	@keyframes orb-drift {
		0% {
			translate: -6% -4%;
			scale: 1;
		}
		50% {
			translate: 5% 6%;
			scale: 1.08;
		}
		100% {
			translate: -3% 5%;
			scale: 0.96;
		}
	}

	@keyframes orb-breathe {
		from {
			scale: 0.94;
		}
		to {
			scale: 1.06;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.orb__blob,
		.orb__core {
			animation: none;
		}
	}
</style>
