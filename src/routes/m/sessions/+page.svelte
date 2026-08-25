<script lang="ts">
	import { ArrowUpRight, MessagesSquare } from '@lucide/svelte';

	import LL from '$i18n/i18n-svelte';
	import { resolve } from '$app/paths';
	import Head from '$lib/components/Head.svelte';
	import { sessionsStore } from '$lib/localStorage';
	import { resolveSessionTitle } from '$lib/sessions';
	import { formatTimestampToNow } from '$lib/utils';

	/**
	 * Every conversation, newest first.
	 *
	 * A list and nothing else. The home screen shows the last few because that is
	 * what somebody opening the app wants; this is where they come when the one
	 * they want is not among them, and the only thing it owes them is to be
	 * complete and quick to scan.
	 */
	const sessions = $derived($sessionsStore ?? []);
</script>

<Head title={$LL.mobileTabChats()} />

<div class="flex flex-col gap-4 px-5 pt-6 pb-32">
	<h1 class="text-active text-2xl font-semibold tracking-tight">{$LL.mobileTabChats()}</h1>

	{#if sessions.length}
		<div class="flex flex-col gap-2">
			{#each sessions as session (session.id)}
				<a
					href={resolve('/m/sessions/[id]', { id: session.id })}
					class="border-shade-3 bg-shade-0 flex items-center gap-3 rounded-xl border px-3.5 py-3 transition-colors active:opacity-80"
				>
					<span class="flex min-w-0 flex-1 flex-col">
						<span class="text-active truncate text-sm">{resolveSessionTitle(session)}</span>
						{#if session.updatedAt}
							<span class="text-muted text-xs">{formatTimestampToNow(session.updatedAt)}</span>
						{/if}
					</span>
					<ArrowUpRight class="text-muted h-4 w-4 shrink-0" />
				</a>
			{/each}
		</div>
	{:else}
		<div
			class="border-shade-4 text-muted flex flex-col items-center gap-2 rounded-2xl border border-dashed px-6 py-10 text-center"
		>
			<MessagesSquare class="h-5 w-5" />
			<span class="text-sm">{$LL.mobileNoSessions()}</span>
		</div>
	{/if}
</div>
