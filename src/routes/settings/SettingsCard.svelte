<script lang="ts">
	import { ChevronDown } from '@lucide/svelte';
	import type { Snippet } from 'svelte';
	import { slide } from 'svelte/transition';

	/**
	 * One configured thing, as a card that stays quiet until you open it.
	 *
	 * A connection, a bot and an MCP server are the same object seen three times: a
	 * name you can change, a state you flip at a glance, and a form you only want
	 * while editing. The shape lives here and the contents arrive as snippets.
	 *
	 * The row's opening target is laid *under* the header rather than wrapped
	 * around it, because a heading you can rename is a text field and a text field
	 * cannot live inside a button. Everything interactive claims its clicks back
	 * with `pointer-events-auto`.
	 */
	interface Props {
		/** Whether the body is showing. Bindable, for a card that opens on arrival. */
		open?: boolean;
		/** What the opening target is called, for a screen reader. */
		label: string;
		/** Left undefined, no switch is drawn: not every card has one state that matters more than the others, and an empty toggle is worse than none. */
		enabled?: boolean;
		/** What the switch means, for its tooltip and its accessible name. */
		enabledLabel?: string;
		/** A switch that may be read but not moved: an administrator's suspension. */
		enabledDisabled?: boolean;
		/** Called after the switch moves, so the parent can persist. */
		onToggle?: () => void;
		/** Whether the status dot beside the subtitle reads as live. */
		healthy?: boolean;
		/** Classes for the square badge, which is coloured by state or by provider. */
		iconClass?: string;
		/** Inline colours for the same badge, where they are computed rather than named. */
		iconStyle?: string;
		/** Kept for the tests that address one of these by name. */
		testId?: string;
		/** The badge's contents: initials, or an icon. */
		icon?: Snippet;
		/** The heading. Plain text on some cards, a rename field on others. */
		title: Snippet;
		/** The line under it, which is what the card answers when it is closed. */
		subtitle?: Snippet;
		/** What sits between the switch and the chevron, e.g. a sync button. */
		actions?: Snippet;
		/** The form, shown only when the card is open. */
		children: Snippet;
	}

	let {
		open = $bindable(false),
		label,
		enabled = $bindable(undefined),
		enabledLabel = '',
		enabledDisabled = false,
		onToggle,
		healthy = false,
		iconClass = 'bg-shade-2 text-muted',
		iconStyle = undefined,
		testId = undefined,
		icon,
		title,
		subtitle,
		actions,
		children
	}: Props = $props();
</script>

<div
	data-testid={testId}
	class="bg-shade-0 overflow-hidden rounded-xl border transition-colors {open
		? 'border-shade-4'
		: 'border-shade-3'}"
>
	<div class="relative flex items-center gap-3 p-3">
		<button
			type="button"
			onclick={() => (open = !open)}
			aria-label={label}
			aria-expanded={open}
			class="absolute inset-0"
		></button>

		{#if icon}
			<span
				class="pointer-events-none flex h-9 w-9 shrink-0 items-center justify-center rounded-lg {iconClass}"
				style={iconStyle}
				aria-hidden="true"
			>
				{@render icon()}
			</span>
		{/if}

		<span class="pointer-events-none flex min-w-0 flex-1 flex-col items-start">
			{@render title()}
			{#if subtitle}
				<span class="text-muted flex items-center gap-1.5 text-xs">
					<span
						class="inline-block h-1.5 w-1.5 shrink-0 rounded-full {healthy
							? 'bg-positive'
							: 'bg-shade-4'}"
					></span>
					{@render subtitle()}
				</span>
			{/if}
		</span>

		<!-- On the row rather than inside the form: it is the state you want to see and
		     change without opening anything. -->
		{#if enabled !== undefined}
			<label
				class="pointer-events-auto relative flex shrink-0 cursor-pointer items-center"
				title={enabledLabel}
			>
				<input
					type="checkbox"
					bind:checked={enabled}
					onchange={() => onToggle?.()}
					disabled={enabledDisabled}
					aria-label={enabledLabel}
					class="peer sr-only"
				/>
				<span
					class="bg-shade-3 peer-checked:bg-accent peer-focus-visible:ring-accent relative h-5 w-9 rounded-full transition-colors peer-focus-visible:ring-2 peer-disabled:opacity-50 after:absolute after:top-0.5 after:left-0.5 after:h-4 after:w-4 after:rounded-full after:bg-white after:transition-transform peer-checked:after:translate-x-4"
				></span>
			</label>
		{/if}

		{#if actions}
			<span class="pointer-events-auto relative flex shrink-0 items-center gap-1">
				{@render actions()}
			</span>
		{/if}

		<span class="text-muted pointer-events-none relative shrink-0 p-1" aria-hidden="true">
			<ChevronDown class="base-icon transition-transform {open ? 'rotate-180' : ''}" />
		</span>
	</div>

	{#if open}
		<div
			class="border-shade-3 flex flex-col gap-4 border-t p-4"
			transition:slide={{ duration: 150 }}
		>
			{@render children()}
		</div>
	{/if}
</div>
