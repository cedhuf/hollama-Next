<script lang="ts">
	import LL from '$i18n/i18n-svelte';

	/**
	 * What was spent, day by day. A total says how much, not whether it happened
	 * yesterday or has been happening all month, which is the difference between a
	 * mistake and a habit.
	 *
	 * Bars rather than a line: these are separate days, and a line between Tuesday
	 * and Thursday invents a Wednesday. Plain elements rather than SVG, because a
	 * `<div>` already knows how to be a rectangle, in the theme, at any width.
	 */
	interface Props {
		days: { day: string; cost: number }[];
		/** Drawn as a line across the bars, when there is one to draw. */
		limit?: number;
		/** How a figure is written, so this and the total agree. */
		format: (value: number) => string;
	}

	let { days, limit = 0, format }: Props = $props();

	/** The busiest day, or the limit when it is higher: scaled to the busiest day alone, a quiet month looks exactly like a runaway one. */
	const peak = $derived(Math.max(limit, ...days.map((d) => d.cost), 0));

	/** Thirty empty columns say nothing. One sentence says it. */
	const empty = $derived(days.every((entry) => entry.cost === 0));

	const label = (day: string) =>
		new Date(`${day}T00:00:00.000Z`).toLocaleDateString(undefined, {
			day: 'numeric',
			month: 'short'
		});
</script>

{#if empty}
	<p
		class="border-shade-3 text-muted flex h-16 items-center justify-center rounded-md border border-dashed text-xs"
	>
		{$LL.usageNothingYet()}
	</p>
{:else if days.length}
	<div class="flex flex-col gap-1">
		<div class="relative flex h-16 items-end gap-px">
			{#if limit > 0 && peak > 0}
				<!-- Where the allowance sits, against the days under it. -->
				<div
					class="border-warning/60 pointer-events-none absolute inset-x-0 border-t border-dashed"
					style="bottom:{(limit / peak) * 100}%"
					aria-hidden="true"
				></div>
			{/if}

			{#each days as entry (entry.day)}
				{@const height = peak > 0 ? (entry.cost / peak) * 100 : 0}
				<!-- A day with nothing spent keeps its column: the gaps are half of what a month
				     of spending says. -->
				<div
					class="group relative flex flex-1 items-end"
					title="{label(entry.day)} · {format(entry.cost)}"
				>
					<div
						class="w-full rounded-sm transition-[height] {entry.cost > 0
							? 'bg-accent/70'
							: 'bg-shade-3'}"
						style="height:{entry.cost > 0 ? Math.max(height, 4) : 2}%"
					></div>
				</div>
			{/each}
		</div>

		<div class="text-muted flex justify-between text-[10px]">
			<span>{label(days[0].day)}</span>
			<span>{$LL.usageToday()}</span>
		</div>
	</div>
{/if}
