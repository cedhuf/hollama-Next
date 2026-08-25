<script lang="ts">
	import { onMount } from 'svelte';

	import LL from '$i18n/i18n-svelte';

	/**
	 * What this instance lets you spend, as one figure.
	 *
	 * The usage card answers a different question, and answers it in a chart: what
	 * have I spent, against what, over thirty days. Right in Settings, wrong in a
	 * welcome, where the account is an hour old and every figure is zero.
	 *
	 * Here the number is the whole design. It counts up on arrival rather than
	 * being printed, which is the difference between a figure and an announcement,
	 * and no ceiling gets the glyph that says so instead of a word.
	 */
	type Usage = {
		period: 'month' | 'week' | 'day';
		limit: number;
		currencies: string[];
	};

	let usage = $state<Usage | null>(null);
	let shown = $state(0);

	onMount(async () => {
		try {
			const response = await fetch('/api/usage');
			if (response.ok) usage = await response.json();
		} catch {
			// A welcome that opens by apologising for a network call is worse than one
			// that says slightly less.
		}
	});

	/** Half a second of counting, or the figure itself where motion is unwelcome. */
	$effect(() => {
		const target = usage?.limit ?? 0;
		if (!target) return;
		if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
			shown = target;
			return;
		}

		const started = performance.now();
		let frame = 0;
		const tick = (now: number) => {
			const t = Math.min(1, (now - started) / 600);
			// Decelerating, so it lands rather than stops.
			shown = target * (1 - Math.pow(1 - t, 3));
			if (t < 1) frame = requestAnimationFrame(tick);
		};
		frame = requestAnimationFrame(tick);
		return () => cancelAnimationFrame(frame);
	});

	const period = $derived(
		usage?.period === 'week'
			? $LL.allowancePerWeek()
			: usage?.period === 'day'
				? $LL.allowancePerDay()
				: $LL.allowancePerMonth()
	);

	/** One currency or none: a ceiling summed from several is not one figure. */
	const currency = $derived(usage?.currencies.length === 1 ? usage.currencies[0] : '');
</script>

{#if usage}
	<div class="allowance border-accent/20 flex flex-col items-center gap-1 rounded-2xl border py-6">
		{#if usage.limit > 0}
			<span class="text-active text-4xl leading-none font-semibold tabular-nums">
				{shown.toLocaleString(undefined, { maximumFractionDigits: shown < 10 ? 2 : 0 })}
				{#if currency}<span class="text-muted text-xl font-normal">{currency}</span>{/if}
			</span>
			<span class="text-active text-sm">{period}</span>
			<span class="text-muted text-xs">{$LL.usageSetByAdmin()}</span>
		{:else}
			<span class="text-accent text-5xl leading-none font-semibold" aria-hidden="true">∞</span>
			<span class="text-active text-sm">{$LL.allowanceUnlimited()}</span>
			<span class="text-muted text-xs">{$LL.allowanceUnlimitedBody()}</span>
		{/if}
	</div>
{/if}

<style lang="postcss">
	/* Tinted rather than bordered in grey, and it drifts: this is the one panel in
	   the tour that is good news, and it is allowed to look like it. */
	.allowance {
		background: linear-gradient(
			120deg,
			color-mix(in srgb, var(--color-accent) 16%, transparent),
			color-mix(in srgb, var(--color-accent) 4%, transparent),
			color-mix(in srgb, var(--color-accent) 16%, transparent)
		);
		background-size: 200% 100%;
		animation: allowance-drift 7s ease-in-out infinite alternate;
	}

	@keyframes allowance-drift {
		from {
			background-position: 0% 50%;
		}
		to {
			background-position: 100% 50%;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.allowance {
			animation: none;
		}
	}
</style>
