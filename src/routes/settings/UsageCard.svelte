<script lang="ts">
	import { onMount } from 'svelte';

	import LL from '$i18n/i18n-svelte';

	/**
	 * What you have spent this period, and what you are allowed.
	 *
	 * In Profile, under who you are and above what you can edit, because it is a
	 * fact about you rather than a setting of yours: the allowance is the
	 * instance's decision and the card says so. A limit nobody can see is a limit
	 * that arrives as a surprise the day it stops you.
	 *
	 * Absent entirely in local mode and on an instance that has set no limit and
	 * priced no model — there is nothing true to say, and a bar at zero out of
	 * zero would be an invention.
	 */
	interface Usage {
		period: 'month' | 'week';
		from: string;
		resetsAt: string;
		limit: number;
		spend: { inputTokens: number; outputTokens: number; cost: number };
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

	const ratio = $derived(usage?.limit ? Math.min(usage.spend.cost / usage.limit, 1) : 0);
	const percent = $derived(Math.round(ratio * 100));

	/** Warm past two thirds, red at the top: the same reading as the context ring. */
	const tone = $derived(ratio >= 0.9 ? 'bg-red-500' : ratio >= 0.66 ? 'bg-amber-500' : 'bg-accent');

	const money = (value: number) =>
		value.toLocaleString(undefined, { maximumFractionDigits: value < 1 ? 3 : 2 });

	const resets = $derived(
		usage
			? new Date(usage.resetsAt).toLocaleString(undefined, {
					dateStyle: 'medium',
					timeStyle: 'short'
				})
			: ''
	);
</script>

{#if usage && (usage.limit > 0 || usage.spend.cost > 0)}
	<div class="flex flex-col gap-2 rounded-xl border border-shade-3 bg-shade-0 p-4">
		<div class="flex items-baseline justify-between gap-2">
			<span class="text-sm font-medium text-active">{$LL.usageTitle()}</span>
			<span class="text-xs tabular-nums text-muted">
				{#if usage.limit > 0}
					{$LL.usageOfLimit({ spent: money(usage.spend.cost), limit: money(usage.limit) })}
				{:else}
					<!-- No limit at all, said as it is rather than as an empty bar. -->
					{$LL.usageUnlimited()}
				{/if}
			</span>
		</div>

		{#if usage.limit > 0}
			<div class="h-1.5 overflow-hidden rounded-full bg-shade-3">
				<div class="h-full transition-[width] duration-500 {tone}" style="width:{percent}%"></div>
			</div>
		{/if}

		<div class="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-xs text-muted">
			<span>
				{usage.period === 'week' ? $LL.usagePerWeek() : $LL.usagePerMonth()}
				{#if usage.limit > 0}
					· {$LL.usageSetByAdmin()}
				{/if}
			</span>
			<span class="tabular-nums">{$LL.usageResetsAt({ at: resets })}</span>
		</div>

		<p class="text-[11px] text-muted">{$LL.usageEstimateNote()}</p>
	</div>
{/if}
