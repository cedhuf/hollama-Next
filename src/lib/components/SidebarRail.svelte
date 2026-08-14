<script lang="ts">
	import { Library, MessageSquareText, Plus } from '@lucide/svelte';

	import LL from '$i18n/i18n-svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { settingsStore } from '$lib/localStorage';
	import { launchPersona, type Persona } from '$lib/personas';
	import { resolveSessionTitle, type SessionSummary } from '$lib/sessions';

	import ContextMenu from './ContextMenu.svelte';
	import PersonaAvatar from './PersonaAvatar.svelte';
	import SessionMenu from './SessionMenu.svelte';
	import Tooltip from './Tooltip.svelte';

	interface Props {
		personas: Persona[];
		/** A handful of recent conversations, reachable without expanding the column. */
		sessions: SessionSummary[];
		onNewChat: () => void;
	}

	let { personas, sessions, onNewChat }: Props = $props();

	const pathname = $derived(page.url.pathname);
	const onLibrary = $derived(pathname.includes('/library') || pathname.includes('/knowledge'));
	const onChats = $derived(pathname.includes('/sessions'));

	function initial(session: SessionSummary): string {
		return (resolveSessionTitle(session).trim().charAt(0) || '#').toUpperCase();
	}
</script>

<!-- The whole column in one lane: the primary actions, then the same launchers the
     full width shows.

     Every target here is a picture of itself, so every one of them needs its name
     said somewhere. A `title` attribute would do it for a mouse and for nobody
     else: it waits a second, it cannot be reached by keyboard, and it is drawn by
     the operating system rather than by the app. These are the app's own tooltips,
     opening on focus as readily as on hover, and pointing right because that is
     where the room is. -->
<div
	class="flex min-h-0 flex-1 flex-col items-center gap-1.5 overflow-y-auto px-0 py-3 surface-pane"
>
	<Tooltip side="right">
		{#snippet trigger({ props })}
			<button
				{...props}
				onclick={onNewChat}
				aria-label={$LL.newChat()}
				class="flex h-9 w-9 items-center justify-center rounded-lg bg-accent text-shade-0 transition-opacity hover:opacity-90"
			>
				<Plus class="h-5 w-5" />
			</button>
		{/snippet}
		{$LL.newChat()}
	</Tooltip>

	<Tooltip side="right">
		{#snippet trigger({ props })}
			<a
				{...props}
				href={resolve('/sessions')}
				aria-label={$LL.chats()}
				class="flex h-9 w-9 items-center justify-center rounded-lg transition-colors {onChats
					? 'bg-shade-0 text-active'
					: 'text-muted hover:text-active'}"
			>
				<MessageSquareText class="h-5 w-5" />
			</a>
		{/snippet}
		{$LL.chats()}
	</Tooltip>

	<Tooltip side="right">
		{#snippet trigger({ props })}
			<a
				{...props}
				href={resolve('/library')}
				aria-label={$LL.library()}
				class="flex h-9 w-9 items-center justify-center rounded-lg transition-colors {onLibrary
					? 'bg-shade-0 text-active'
					: 'text-muted hover:text-active'}"
			>
				<Library class="h-5 w-5" />
			</a>
		{/snippet}
		{$LL.library()}
	</Tooltip>

	{#if personas.length > 0}
		<div class="my-1 h-px w-8 bg-shade-3"></div>
		{#each personas as persona (persona.id)}
			<Tooltip side="right">
				{#snippet trigger({ props })}
					<button
						{...props}
						type="button"
						onclick={() =>
							goto(
								resolve('/sessions/[id]', { id: launchPersona(persona, $settingsStore.models) })
							)}
						aria-label={persona.name}
						class="rounded-full outline-none transition duration-150 hover:scale-105 focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-shade-1 motion-reduce:transition-none"
					>
						<PersonaAvatar {persona} size={32} />
					</button>
				{/snippet}
				{persona.tagline || persona.name}
			</Tooltip>
		{/each}
	{/if}

	{#if sessions.length > 0}
		<div class="my-1 h-px w-8 bg-shade-3"></div>
		{#each sessions as session (session.id)}
			<!-- The right-click menu belongs to a conversation, not to the width it is
			     drawn at. The wrapper is what the gesture targets, so the tooltip inside
			     keeps the button to itself and the two never argue over the same events. -->
			<ContextMenu>
				{#snippet trigger({ props })}
					<div {...props}>
						<Tooltip side="right">
							{#snippet trigger({ props: hover })}
								<button
									{...hover}
									type="button"
									onclick={() => goto(resolve('/sessions/[id]', { id: session.id }))}
									aria-label={resolveSessionTitle(session) || $LL.untitled()}
									class="flex h-8 w-8 items-center justify-center rounded-md border text-xs font-medium transition-colors {pathname.includes(
										session.id
									)
										? 'border-accent bg-shade-0 text-active'
										: 'border-shade-3 text-muted hover:text-active'}"
								>
									{initial(session)}
								</button>
							{/snippet}
							{resolveSessionTitle(session) || $LL.untitled()}
						</Tooltip>
					</div>
				{/snippet}

				<SessionMenu id={session.id} pinned={session.pinned} />
			</ContextMenu>
		{/each}
	{/if}
</div>
