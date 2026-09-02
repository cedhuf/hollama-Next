<script lang="ts">
	import { Check, Trash2 } from '@lucide/svelte';
	import type { Component } from 'svelte';

	import LL from '$i18n/i18n-svelte';

	/**
	 * The app's one destructive button. Two clicks, in place: no modal, since these
	 * live in a hovered row or a toolbar.
	 *
	 * The armed state disarms itself after a few seconds, on Escape, and on a click
	 * anywhere else. That is what makes two clicks safe, and what the four
	 * hand-written copies forgot.
	 */
	interface Props {
		/** Run when the second click lands. */
		onConfirm: () => void;
		/** What it does, for the tooltip and the accessible name. */
		label?: string;
		/** Its own icon, where a trash can is the wrong picture. */
		icon?: Component<{ class?: string }>;
		/** Tighter padding, for a list row that is forty pixels tall. */
		compact?: boolean;
		disabled?: boolean;
		/** Shown beside the icon where the width allows it. */
		text?: string;
		/** Bindable, for a row that has to keep its buttons on screen while the question stands, or that arms it from a context menu. */
		armed?: boolean;
	}

	let {
		onConfirm,
		label,
		icon: Icon = Trash2,
		compact = false,
		disabled = false,
		text,
		armed = $bindable(false)
	}: Props = $props();

	/** Long enough to reach, short enough that nobody comes back to a loaded button. */
	const DISARM_AFTER = 4_000;

	let timer: ReturnType<typeof setTimeout> | undefined;

	function disarm() {
		armed = false;
		clearTimeout(timer);
	}

	function press(event: MouseEvent) {
		// A row is often clickable itself, and arming a button is not opening what it
		// sits on.
		event.stopPropagation();
		if (armed) {
			disarm();
			onConfirm();
			return;
		}
		armed = true;
		clearTimeout(timer);
		timer = setTimeout(disarm, DISARM_AFTER);
	}

	$effect(() => () => clearTimeout(timer));

	const name = $derived(armed ? $LL.confirmDeletion() : (label ?? $LL.delete()));
</script>

<svelte:window
	onkeydown={(event) => armed && event.key === 'Escape' && disarm()}
	onpointerdown={(event) => {
		if (armed && !(event.target as HTMLElement)?.closest('[data-confirm-button]')) disarm();
	}}
/>

<button
	type="button"
	data-confirm-button
	{disabled}
	onclick={press}
	title={name}
	aria-label={name}
	class="flex shrink-0 items-center gap-1.5 rounded-md transition-colors disabled:pointer-events-none disabled:opacity-40 {compact
		? 'p-1'
		: 'p-1.5'} {armed
		? 'bg-negative/10 text-negative'
		: 'text-muted hover:bg-shade-2 hover:text-negative'}"
>
	{#if armed}
		<Check class={compact ? 'h-3.5 w-3.5' : 'h-4 w-4'} />
	{:else}
		<Icon class={compact ? 'h-3.5 w-3.5' : 'h-4 w-4'} />
	{/if}
	{#if text}
		<span class="text-xs">{armed ? $LL.confirmDeletion() : text}</span>
	{/if}
</button>
