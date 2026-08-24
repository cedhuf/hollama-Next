<script lang="ts">
	import { onMount } from 'svelte';

	import LL from '$i18n/i18n-svelte';
	import Meter from '$lib/components/Meter.svelte';
	import SpendChart from '$lib/components/SpendChart.svelte';

	/**
	 * What you have spent this period, and what you are allowed.
	 *
	 * In Profile, under who you are and above what you can edit, because it is a
	 * fact about you rather than a setting of yours: the allowance is the
	 * instance's decision and the card says so. A limit nobody can see is a limit
	 * that arrives as a surprise the day it stops you.
	 *
	 * Shown whether or not there is a limit, and to administrators as much as to
	 * anyone: somebody who can raise their own ceiling still wants to know what
	 * they are spending under it. Without a limit there is no bar, because a bar
	 * needs two numbers: the figure alone is the whole answer.
	 */
	interface Usage {
		period: 'month' | 'week' | 'day';
		from: string;
		resetsAt: string;
		limit: number;
		spend: { inputTokens: number; outputTokens: number; cost: number };
		/** What the prices behind these figures are written in. */
		currencies: string[];
		history: { day: string; cost: number }[];
	}

	let usage = $state<Usage | null>(null);

	onMount(async () => {
		try {
			const response = await fetch('/api/usage');
			if (response.ok) usage = await response.json();
		} catch {
			// Nothing to show is better than an error about a figure nobody asked for.
		}
	});

	/**
	 * A figure with its unit, when there is one unit to give it.
	 *
	 * With prices in a single currency the amount can carry it. With several, it
	 * cannot: nothing is converted, so the total is a sum of different things and
	 * labelling it with one of them would be the lie. It says so instead.
	 */
	const money = (value: number) => {
		const amount = value.toLocaleString(undefined, {
			maximumFractionDigits: value < 1 ? 3 : 2
		});
		const currencies = usage?.currencies ?? [];
		return currencies.length === 1 ? `${amount} ${currencies[0]}` : amount;
	};

	const mixed = $derived((usage?.currencies.length ?? 0) > 1);

	/**
	 * The tokens behind the figure.
	 *
	 * At a fifth of a euro per million, a week of real use rounds to a thousandth
	 * and the amount alone says almost nothing. The token count is the same fact
	 * at a scale somebody can feel, and it is the one the provider actually
	 * reported: the money is our arithmetic on top of it.
	 */
	const tokens = $derived(usage ? usage.spend.inputTokens + usage.spend.outputTokens : 0);

	const compact = (value: number) =>
		value >= 1_000_000
			? `${(value / 1_000_000).toFixed(1)}M`
			: value >= 1_000
				? `${Math.round(value / 1000)}k`
				: String(value);

	const resets = $derived(
		usage
			? new Date(usage.resetsAt).toLocaleString(undefined, {
					dateStyle: 'medium',
					timeStyle: 'short'
				})
			: ''
	);
</script>

{#if usage}
	<div class="border-shade-3 bg-shade-0 flex flex-col gap-2 rounded-xl border p-4">
		<div class="flex items-baseline justify-between gap-2">
			<span class="text-active text-sm font-medium">{$LL.usageTitle()}</span>
			<span class="text-muted flex items-baseline gap-1.5 text-xs tabular-nums">
				{#if tokens > 0}
					<span class="opacity-70">{$LL.usageTokens({ tokens: compact(tokens) })}</span>
				{/if}
				{#if usage.limit > 0}
					{$LL.usageOfLimit({ spent: money(usage.spend.cost), limit: money(usage.limit) })}
				{:else}
					<!-- No ceiling, so what is spent is the whole answer. -->
					{$LL.usageSpent({ spent: money(usage.spend.cost) })} · {$LL.usageUnlimited()}
				{/if}
			</span>
		</div>

		{#if usage.limit > 0}
			<Meter
				value={usage.spend.cost}
				max={usage.limit}
				label={$LL.usageTitle()}
				valueLabel={$LL.usageOfLimit({
					spent: money(usage.spend.cost),
					limit: money(usage.limit)
				})}
			/>
		{/if}

		<!-- Thirty days behind the figure, whatever the period: a month of history
		     beside a weekly allowance is what says whether this week is unusual. -->
		<SpendChart days={usage.history} limit={usage.limit} format={money} />

		<div class="text-muted flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-xs">
			<span>
				{usage.period === 'week'
					? $LL.usagePerWeek()
					: usage.period === 'day'
						? $LL.usagePerDay()
						: $LL.usagePerMonth()}
				{#if usage.limit > 0}
					· {$LL.usageSetByAdmin()}
				{/if}
			</span>
			<span class="tabular-nums">{$LL.usageResetsAt({ at: resets })}</span>
		</div>

		<p class="text-muted text-[11px]">
			{$LL.usageEstimateNote()}
			{#if mixed}
				{$LL.usageMixedCurrencies({ currencies: usage.currencies.join(', ') })}
			{/if}
		</p>
	</div>
{/if}
