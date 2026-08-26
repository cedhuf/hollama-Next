<script lang="ts">
	import { Coins } from '@lucide/svelte';
	import { onMount } from 'svelte';

	import LL from '$i18n/i18n-svelte';

	/**
	 * What this instance lets you spend, and how much of it is gone.
	 *
	 * The ceiling is the subject of the card and stays the subject. It is the fact
	 * somebody came here for, and the spend qualifies it rather than replacing it:
	 * a card whose biggest number is what you have used reads as a bill, where this
	 * one is meant to read as an allowance.
	 *
	 * `spend` off, the card is the ceiling alone. That is the welcome tour, where
	 * the account is an hour old, every figure below would be zero, and announcing
	 * the allowance is the whole point. On, the bar and the two facts under it
	 * appear, which is Profile, where the question is whether you can keep going.
	 *
	 * Still not the usage card in Settings. That one is a chart over thirty days,
	 * and a chart is what you read when you want to know why. This is what you
	 * glance at on a phone.
	 *
	 * One animation drives everything. A single eased value climbs from nothing to
	 * one on arrival, the figure and the bar are both read off it, and they land
	 * together. Two timers would have been two things to keep in step, and the day
	 * they drifted the card would show a full bar over a number still counting.
	 */
	interface Props {
		/** Show what has been spent against the ceiling, not only the ceiling. */
		spend?: boolean;
	}

	let { spend = false }: Props = $props();

	/**
	 * Only the fields this card draws, and `spend` is an object rather than a
	 * figure.
	 *
	 * It carries the tokens, the images and the seconds beside the cost, because
	 * the card in Settings reports all four. Here only `cost` is wanted, and naming
	 * the shape is what stops it being read as the figure: the answer arrives from
	 * `response.json()`, so this declaration is the only thing that was ever going
	 * to catch the difference.
	 */
	type Usage = {
		period: 'month' | 'week' | 'day';
		limit: number;
		spend: { cost: number };
		resetsAt: string;
	};

	let usage = $state<Usage | null>(null);

	/** Arrival, from nothing to one. Everything the card draws is read off it. */
	let t = $state(0);

	onMount(async () => {
		try {
			const response = await fetch('/api/usage');
			if (response.ok) usage = await response.json();
		} catch {
			// A card that opens by apologising for a network call is worse than one
			// that says slightly less.
		}
	});

	/** Six tenths of a second, or the finished state where motion is unwelcome. */
	$effect(() => {
		if (!usage) return;
		if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
			t = 1;
			return;
		}

		const started = performance.now();
		let frame = 0;
		const tick = (now: number) => {
			const elapsed = Math.min(1, (now - started) / 600);
			// Decelerating, so it lands rather than stops.
			t = 1 - Math.pow(1 - elapsed, 3);
			if (elapsed < 1) frame = requestAnimationFrame(tick);
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

	/**
	 * No currency here, on purpose.
	 *
	 * The instance counts in whatever its prices are written in, and on a
	 * connection that reports its own costs it counts in whatever that provider
	 * bills in. Printing one of those beside an allowance invites a question this
	 * card has no business raising: whether the figure is euros, dollars, or two
	 * currencies added together, which nothing anywhere converts.
	 *
	 * It is also not the question being asked. Somebody looking here wants to know
	 * how much of their allowance is left, and a mark that means "this instance's
	 * unit of account" answers that exactly. Settings still shows the real
	 * currencies, admits it when there is more than one, and is where that question
	 * belongs.
	 */

	/** How much of the allowance is gone, capped: a bar cannot be more than full. */
	const fraction = $derived(usage?.limit ? Math.min(1, usage.spend.cost / usage.limit) : 0);

	/**
	 * Past the ceiling, which the app allows on purpose.
	 *
	 * A turn already running always finishes, and what it cost is only known once
	 * it has, so an allowance is a line you can be carried over rather than a wall.
	 * The bar says so by changing colour instead of by refusing to fill.
	 */
	const over = $derived(!!usage?.limit && usage.spend.cost > usage.limit);

	/** The day the counter goes back to zero, in the reader's own format. */
	const resets = $derived(
		usage?.resetsAt
			? new Date(usage.resetsAt).toLocaleDateString(undefined, { day: 'numeric', month: 'long' })
			: ''
	);

	/**
	 * A figure, and never the word NaN.
	 *
	 * The guard is here because it already happened: `spend` carries the cost, this
	 * card read it as the cost, and the arithmetic printed `NaN / 20 EUR` in front
	 * of somebody. The shape above is the fix; this makes the next such mistake
	 * render a nought rather than shout about itself.
	 */
	const money = (value: number) =>
		(Number.isFinite(value) ? value : 0).toLocaleString(undefined, {
			maximumFractionDigits: value < 10 ? 2 : 0
		});

	/** Spoken, for the places a mark cannot be read: `12 credits`. */
	const spelled = (value: number) => `${money(value)} ${$LL.usageCredits()}`;
</script>

{#if usage}
	<div class="allowance border-accent/20 flex flex-col items-center rounded-2xl border px-5 py-6">
		{#if usage.limit > 0}
			<span
				class="text-active flex items-baseline gap-2 text-4xl leading-none font-semibold tabular-nums"
			>
				<!-- The same mark the price fields use, so a figure here and a figure in
				     Models and prices are visibly the same unit. Baseline-aligned rather
				     than centred: next to a number this size, a centred icon floats. -->
				<Coins class="text-accent h-6 w-6 shrink-0 self-center" aria-hidden="true" />
				{money(usage.limit * t)}
			</span>
			<span class="text-active mt-1.5 text-sm">{period}</span>

			{#if spend}
				<!-- Filled from the same arrival value as the figure above, so the two
				     cannot disagree. Its own rounded cap and a breath of glow, because a
				     flat rectangle under a card this warm reads as a loading placeholder. -->
				<div
					class="track mt-4"
					role="progressbar"
					aria-valuemin={0}
					aria-valuemax={usage.limit}
					aria-valuenow={usage.spend.cost}
					aria-label={$LL.usageSpent({ spent: spelled(usage.spend.cost) })}
				>
					<span class="fill" class:fill--over={over} style="--fill: {fraction * t}"></span>
				</div>

				<!-- The figure without its unit, because the unit is already the largest
				     thing on the card. Written twice on something this small, a currency
				     stops reading as information and starts reading as a template. The
				     accessible name below keeps it: there, nothing else is in view. -->
				<p class="text-muted mt-3 flex flex-wrap items-center justify-center text-xs">
					<span class="font-medium {over ? 'text-negative' : 'text-active'}">
						{$LL.usageSpent({ spent: money(usage.spend.cost) })}
					</span>
					{#if resets}
						<!-- A drawn separator rather than a character, so it is spacing and
						     colour rather than a glyph that can wrap to a line of its own. -->
						<span class="sep" aria-hidden="true"></span>
						<span>{$LL.allowanceResets({ date: resets })}</span>
					{/if}
				</p>
			{/if}

			<span class="text-muted mt-2 text-xs">{$LL.usageSetByAdmin()}</span>
		{:else}
			<span class="text-accent text-5xl leading-none font-semibold" aria-hidden="true">∞</span>
			<span class="text-active mt-1.5 text-sm">{$LL.allowanceUnlimited()}</span>
			<!-- No ceiling means no fraction to draw, so what is left to say is what has
			     gone. Said only once there is something to say: "0 spent" on a fresh
			     account is a line that reports nothing. -->
			{#if spend && usage.spend.cost > 0}
				<span class="text-muted mt-1 text-xs">
					{$LL.usageSpent({ spent: spelled(usage.spend.cost) })}
				</span>
			{:else}
				<span class="text-muted mt-1 text-xs">{$LL.allowanceUnlimitedBody()}</span>
			{/if}
		{/if}
	</div>
{/if}

<style lang="postcss">
	/* Tinted rather than bordered in grey, and it drifts: this is the one panel in
	   the app that is good news, and it is allowed to look like it. */
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

	/* Sunk rather than drawn on: a hairline of shadow inside the top edge is what
	   makes the fill sit in the track instead of on it. */
	.track {
		position: relative;
		width: 100%;
		max-width: 15rem;
		height: 0.375rem;
		border-radius: 999px;
		overflow: hidden;
		background: color-mix(in srgb, var(--color-accent) 14%, transparent);
		box-shadow: inset 0 1px 2px color-mix(in srgb, black 12%, transparent);
	}

	.fill {
		display: block;
		height: 100%;
		width: calc(var(--fill) * 100%);
		border-radius: 999px;
		/* Lighter at the tail, full strength at the leading edge, so the bar has a
		   direction rather than being a block of colour that happens to stop. */
		background: linear-gradient(
			90deg,
			color-mix(in srgb, var(--color-accent) 72%, transparent),
			var(--color-accent)
		);
		box-shadow: 0 0 10px color-mix(in srgb, var(--color-accent) 45%, transparent);
	}

	.fill--over {
		background: linear-gradient(
			90deg,
			color-mix(in srgb, var(--color-negative) 72%, transparent),
			var(--color-negative)
		);
		box-shadow: 0 0 10px color-mix(in srgb, var(--color-negative) 45%, transparent);
	}

	/* The gap between two facts, as a mark rather than as punctuation: at this size
	   a typed middot sits on the baseline and reads as a full stop. */
	.sep {
		width: 0.1875rem;
		height: 0.1875rem;
		margin: 0 0.5rem;
		border-radius: 999px;
		background: currentColor;
		opacity: 0.5;
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

		.fill {
			box-shadow: none;
		}
	}
</style>
