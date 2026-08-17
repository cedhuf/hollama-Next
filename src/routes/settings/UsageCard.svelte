<script lang="ts">
	import { onMount } from 'svelte';

	import LL from '$i18n/i18n-svelte';
	import { isServerMode } from '$lib/chat/endpoint';
	import Meter from '$lib/components/Meter.svelte';
	import SpendChart from '$lib/components/SpendChart.svelte';
	import { serversStore } from '$lib/localStorage';
	import {
		daysAgo,
		localCurrencies,
		localDaily,
		localPeriodStart,
		localSpend,
		nextMonthStart
	} from '$lib/localUsage';

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
	 * needs two numbers — the figure alone is the whole answer.
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
		// Local mode has no server to ask and nobody to limit: the ledger is in this
		// browser, and what it can still answer is what the month cost. Same shape,
		// so the card below does not know the difference.
		if (!isServerMode) {
			const from = localPeriodStart();
			usage = {
				period: 'month',
				from,
				resetsAt: nextMonthStart(from),
				limit: 0,
				spend: localSpend(from),
				currencies: localCurrencies($serversStore ?? []),
				history: localDaily(daysAgo(29))
			};
			return;
		}

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
	<div class="flex flex-col gap-2 rounded-xl border border-shade-3 bg-shade-0 p-4">
		<div class="flex items-baseline justify-between gap-2">
			<span class="text-sm font-medium text-active">{$LL.usageTitle()}</span>
			<span class="text-xs tabular-nums text-muted">
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

		<div class="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-xs text-muted">
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

		<p class="text-[11px] text-muted">
			{$LL.usageEstimateNote()}
			{#if mixed}
				{$LL.usageMixedCurrencies({ currencies: usage.currencies.join(', ') })}
			{/if}
		</p>
	</div>
{/if}
