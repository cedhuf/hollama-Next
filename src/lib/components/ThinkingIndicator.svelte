<script lang="ts">
	/**
	 * Shown while the model is generating but hasn't emitted any text yet.
	 *
	 * Three dots riding a wave — the same idiom as a typing indicator, so it reads as
	 * "something is coming" rather than as content. Pure CSS: bits-ui has no
	 * indeterminate loader (its Progress/Meter are determinate), and Tailwind's
	 * built-ins (pulse/bounce/ping) can't stagger across siblings.
	 */
	let { label = 'Generating a reply' }: { label?: string } = $props();
</script>

<span class="thinking" role="status" aria-label={label} data-testid="thinking-indicator">
	<span class="thinking__dot"></span>
	<span class="thinking__dot"></span>
	<span class="thinking__dot"></span>
</span>

<style>
	.thinking {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		/* Match a line of body text, so the bubble doesn't jump when the first
		   token replaces the indicator. */
		height: 1.5rem;
	}

	.thinking__dot {
		width: 0.4rem;
		height: 0.4rem;
		border-radius: 9999px;
		background-color: var(--color-accent);
		animation: thinking-wave 1.2s ease-in-out infinite;
	}

	.thinking__dot:nth-child(2) {
		animation-delay: 0.16s;
	}

	.thinking__dot:nth-child(3) {
		animation-delay: 0.32s;
	}

	@keyframes thinking-wave {
		0%,
		70%,
		100% {
			transform: translateY(0) scale(0.7);
			opacity: 0.35;
		}
		35% {
			transform: translateY(-0.18rem) scale(1);
			opacity: 1;
		}
	}

	/* Motion is decorative here; the status role still announces the state. */
	@media (prefers-reduced-motion: reduce) {
		.thinking__dot {
			animation: none;
			opacity: 0.6;
		}
	}
</style>
