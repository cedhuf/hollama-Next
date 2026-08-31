<script lang="ts">
	import { Check, Plug, X } from '@lucide/svelte';
	import { quadOut } from 'svelte/easing';
	import { fly } from 'svelte/transition';

	import LL from '$i18n/i18n-svelte';
	import type { McpApprovalRequest } from '$lib/mcp';

	/**
	 * The turn has stopped, and it is asking.
	 *
	 * Every MCP call passes through here before it is made. Not the ones that look
	 * dangerous: judging that would mean us ruling on tools we have never seen,
	 * described by the very servers whose calls are in question. So the person who
	 * added the server answers, every time, with the exact arguments in front of
	 * them.
	 *
	 * Which is why the arguments are the body of the card rather than something
	 * behind a disclosure. A confirmation that shows only a tool name teaches
	 * people to press yes without reading, and a prompt nobody reads is worse than
	 * no prompt: it moves the responsibility without moving the decision.
	 *
	 * One component for every surface. It is rendered at the foot of the thread,
	 * which on a phone and on a desktop is the same place: just above the composer,
	 * where the eye already is.
	 */
	let {
		request,
		onDecide,
		disabled = false
	}: {
		request: McpApprovalRequest;
		onDecide: (allow: boolean) => void;
		disabled?: boolean;
	} = $props();

	/** Pressed, and waiting for the run to say the question is over. */
	let answered = $state<boolean | null>(null);

	// Nothing resets this, because nothing has to: the card is mounted inside a
	// `{#key request.id}`, so a second question is a second component rather than
	// this one wearing new text. Which is the behaviour to want anyway: the
	// arrival animation plays again, and a card that changed under a finger that
	// was already moving is exactly what a security prompt must never do.

	function decide(allow: boolean) {
		if (disabled || answered !== null) return;
		answered = allow;
		onDecide(allow);
	}
</script>

<div
	class="approval border-accent/40 bg-shade-0 flex flex-col gap-3 rounded-xl border p-3"
	in:fly={{ y: 12, duration: 220, easing: quadOut }}
	out:fly={{ y: 6, duration: 140, easing: quadOut }}
	role="alertdialog"
	aria-label={$LL.mcpApprovalTitle()}
>
	<div class="flex items-start gap-2.5">
		<span
			class="bg-accent/15 text-accent flex h-8 w-8 shrink-0 items-center justify-center rounded-md"
			aria-hidden="true"
		>
			<Plug class="base-icon" />
		</span>
		<div class="min-w-0 flex-1">
			<p class="text-active text-sm font-medium">{$LL.mcpApprovalTitle()}</p>
			<p class="text-muted truncate text-xs">
				{request.server ? `${request.server} · ${request.tool}` : request.tool}
			</p>
		</div>
	</div>

	<!-- What the tool says it does, then what it would be called with. The two
	     questions a person actually has, in that order. -->
	{#if request.purpose}
		<p class="text-muted text-xs leading-snug">{request.purpose}</p>
	{/if}

	{#if request.arguments}
		<pre
			class="bg-shade-1 text-muted max-h-48 overflow-auto rounded-lg p-2.5 font-mono text-[11px] leading-snug whitespace-pre-wrap">{request.arguments}</pre>
	{:else}
		<p class="text-muted text-xs italic">{$LL.mcpApprovalNoArguments()}</p>
	{/if}

	<div class="flex items-center gap-2">
		<button
			type="button"
			onclick={() => decide(true)}
			disabled={disabled || answered !== null}
			class="bg-accent text-shade-0 flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-opacity active:scale-[0.99] disabled:opacity-50"
		>
			<Check class="base-icon" />
			{answered === true ? $LL.mcpApprovalAllowing() : $LL.mcpApprovalAllow()}
		</button>
		<button
			type="button"
			onclick={() => decide(false)}
			disabled={disabled || answered !== null}
			class="border-shade-3 text-muted hover:text-active flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors disabled:opacity-50"
		>
			<X class="base-icon" />
			{$LL.mcpApprovalRefuse()}
		</button>
	</div>

	<!-- Said plainly, because it is the part that makes waiting acceptable: the
	     question does not stand forever, and running out counts as no. -->
	<p class="text-muted text-[11px]">{$LL.mcpApprovalTimeoutHint()}</p>
</div>

<style lang="postcss">
	/* A ring that fades once, on arrival: enough to pull the eye to a card that
	   appeared while the answer was being written, and then out of the way. It is
	   not a pulse. Something that keeps moving under a decision is pressure, and
	   this is a question, not an alarm. */
	.approval {
		animation: approval-arrive 900ms ease-out 1;
	}

	@keyframes approval-arrive {
		from {
			box-shadow: 0 0 0 0 color-mix(in srgb, var(--color-accent) 45%, transparent);
		}
		to {
			box-shadow: 0 0 0 10px transparent;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.approval {
			animation: none;
		}
	}
</style>
