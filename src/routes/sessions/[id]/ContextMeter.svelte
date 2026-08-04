<script lang="ts">
	import LL from '$i18n/i18n-svelte';
	import { contextUsage, formatTokens, type ContextUsage } from '$lib/chat/context';
	import Tooltip from '$lib/components/Tooltip.svelte';
	import type { Session } from '$lib/sessions';

	/**
	 * How full the conversation's context is: a ring that fills as it grows.
	 *
	 * Discreet by design — at rest it is a quiet outline nobody has to read. It
	 * only earns attention as it fills: the colour warms past 60%, and the token
	 * count appears next to it past that, because by then the number is the point.
	 *
	 * Clicking it types `/compact` into the composer without sending. Compaction
	 * costs a request and rewrites what the model can see, so the last step stays
	 * the user's — the meter offers the command, it does not run it.
	 */
	interface Props {
		session: Session;
		threshold: number;
		/** Puts `/compact` in the composer, ready to send. */
		onPrepareCompact: () => void;
	}

	let { session, threshold, onPrepareCompact }: Props = $props();

	const usage = $derived<ContextUsage>(contextUsage(session, threshold));
	const percent = $derived(Math.round(usage.ratio * 100));

	// Geometry for the ring. 16×16 to sit on the same baseline as the lucide icons
	// in the composer strip, which are all `base-icon`.
	const RADIUS = 6;
	const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
	const dash = $derived(usage.ratio * CIRCUMFERENCE);

	const colour = $derived(
		usage.level === 'high'
			? 'text-red-500'
			: usage.level === 'warn'
				? 'text-amber-500'
				: 'text-muted'
	);
</script>

<Tooltip side="top" align="start" class="w-64">
	{#snippet trigger({ props })}
		<button
			{...props}
			type="button"
			onclick={onPrepareCompact}
			aria-label={$LL.contextLoad()}
			data-testid="context-meter"
			class="flex items-center gap-1.5 rounded-md px-2 py-2 transition-colors hover:bg-shade-1 hover:text-active {colour}"
		>
			<svg viewBox="0 0 16 16" class="h-4 w-4 shrink-0" aria-hidden="true">
				<!-- Track, then the filled arc drawn from 12 o'clock clockwise. -->
				<circle
					cx="8"
					cy="8"
					r={RADIUS}
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					class="opacity-25"
				/>
				<circle
					cx="8"
					cy="8"
					r={RADIUS}
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-dasharray="{dash} {CIRCUMFERENCE}"
					transform="rotate(-90 8 8)"
					class="transition-[stroke-dasharray] duration-500"
				/>
			</svg>
			{#if usage.level !== 'ok'}
				<span class="text-xs tabular-nums">{formatTokens(usage.tokens)}</span>
			{/if}
		</button>
	{/snippet}

	<p class="font-medium text-active">{$LL.contextLoad()}</p>
	<p class="mt-1 text-muted">
		{$LL.contextTokensOfLimit({
			tokens: usage.tokens.toLocaleString(),
			limit: usage.limit.toLocaleString(),
			percent
		})}
	</p>
	{#if usage.limitSource === 'model'}
		<!-- Only worth a line when the ceiling is the model's real window: the
		     threshold is the user's own setting, and naming it back at them on every
		     hover is noise. -->
		<p class="text-muted">{$LL.contextLimitFromModel()}</p>
	{/if}
	<p class="mt-1 text-muted">{$LL.contextMessagesInContext({ count: usage.messageCount })}</p>
	{#if usage.compactedCount}
		<p class="text-muted">{$LL.contextMessagesCompacted({ count: usage.compactedCount })}</p>
	{/if}
	<p class="mt-2 border-t border-shade-3 pt-1.5 text-[11px] text-muted">
		{$LL.contextEstimateNote()}
	</p>
</Tooltip>
