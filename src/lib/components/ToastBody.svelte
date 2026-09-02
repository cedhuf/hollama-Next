<script lang="ts">
	import {
		Check,
		CircleAlert,
		CircleCheck,
		Files,
		Info,
		LoaderCircle,
		TriangleAlert
	} from '@lucide/svelte';

	import LL from '$i18n/i18n-svelte';
	import { copyText } from '$lib/clipboard';
	import type { ToastSeverity } from '$lib/toast';

	// The inside of every notification: the library draws the card, the entrance and
	// the swipe. This draws what is written on it, so the copy button has somewhere
	// to live, the library's action slot taking only a label.

	let {
		severity,
		message,
		description,
		action,
		copyable = false,
		closeToast
	}: {
		severity: ToastSeverity;
		message: string;
		description?: string;
		action?: { label: string; onClick: () => void };
		/** Show the copy button. On by default for errors, which get pasted. */
		copyable?: boolean;
		closeToast: () => void;
	} = $props();

	let copied = $state(false);

	const icon = 'mt-px h-4 w-4 shrink-0';

	async function copy() {
		await copyText(description ? `${message}\n${description}` : message);
		copied = true;
	}

	function run() {
		action?.onClick();
		closeToast();
	}
</script>

{#if severity === 'loading'}
	<LoaderCircle class="{icon} text-muted animate-spin" />
{:else if severity === 'success'}
	<CircleCheck class="{icon} text-emerald-500" />
{:else if severity === 'warning'}
	<TriangleAlert class="{icon} text-amber-500" />
{:else if severity === 'error'}
	<CircleAlert class="{icon} text-red-500" />
{:else if severity === 'info'}
	<Info class="{icon} text-accent" />
{/if}

<div class="flex min-w-0 flex-col gap-y-0.5">
	<span class="font-medium wrap-anywhere">{message}</span>
	{#if description}
		<span class="text-muted wrap-anywhere">{description}</span>
	{/if}
</div>

{#if action || copyable}
	<!-- One group, pinned right and centred on the card, so an action and a copy
	     button do not fight over the same edge. -->
	<div class="ml-auto flex shrink-0 items-center gap-x-1 self-center">
		{#if action}
			<button class="text-accent font-medium hover:underline" onclick={run}>{action.label}</button>
		{/if}
		{#if copyable}
			<!-- An error is what gets pasted into an issue, and retyping it from a message
			     about to disappear is a small misery nobody reports. -->
			<button
				class="text-muted hover:text-active hover:bg-shade-2 rounded p-1"
				title={$LL.copy()}
				onclick={copy}
			>
				{#if copied}
					<Check class="h-3.5 w-3.5 text-emerald-500" />
				{:else}
					<Files class="h-3.5 w-3.5" />
				{/if}
			</button>
		{/if}
	</div>
{/if}
