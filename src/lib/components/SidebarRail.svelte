<script lang="ts">
	import { Library, MessageSquareText, Plus } from '@lucide/svelte';

	import LL from '$i18n/i18n-svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { settingsStore } from '$lib/localStorage';
	import { launchPersona, type Persona } from '$lib/personas';
	import { resolveSessionTitle, type SessionSummary } from '$lib/sessions';

	import PersonaAvatar from './PersonaAvatar.svelte';

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
     full width shows, as icons with their name on hover. -->
<div
	class="flex min-h-0 flex-1 flex-col items-center gap-1.5 overflow-y-auto px-0 py-3 surface-pane"
>
	<button
		onclick={onNewChat}
		title={$LL.newChat()}
		aria-label={$LL.newChat()}
		class="flex h-9 w-9 items-center justify-center rounded-lg bg-accent text-shade-0 transition-opacity hover:opacity-90"
	>
		<Plus class="h-5 w-5" />
	</button>
	<a
		href={resolve('/sessions')}
		title={$LL.chats()}
		aria-label={$LL.chats()}
		class="flex h-9 w-9 items-center justify-center rounded-lg transition-colors {onChats
			? 'bg-shade-0 text-active'
			: 'text-muted hover:text-active'}"
	>
		<MessageSquareText class="h-5 w-5" />
	</a>
	<a
		href={resolve('/library')}
		title={$LL.library()}
		aria-label={$LL.library()}
		class="flex h-9 w-9 items-center justify-center rounded-lg transition-colors {onLibrary
			? 'bg-shade-0 text-active'
			: 'text-muted hover:text-active'}"
	>
		<Library class="h-5 w-5" />
	</a>

	{#if personas.length > 0}
		<div class="my-1 h-px w-8 bg-shade-3"></div>
		{#each personas as persona (persona.id)}
			<button
				type="button"
				onclick={() =>
					goto(resolve('/sessions/[id]', { id: launchPersona(persona, $settingsStore.models) }))}
				title={persona.name}
				class="transition-transform hover:scale-105"
			>
				<PersonaAvatar {persona} size={32} />
			</button>
		{/each}
	{/if}

	{#if sessions.length > 0}
		<div class="my-1 h-px w-8 bg-shade-3"></div>
		{#each sessions as session (session.id)}
			<button
				type="button"
				onclick={() => goto(resolve('/sessions/[id]', { id: session.id }))}
				title={resolveSessionTitle(session) || $LL.untitled()}
				aria-label={resolveSessionTitle(session) || $LL.untitled()}
				class="flex h-8 w-8 items-center justify-center rounded-md border text-xs font-medium transition-colors {pathname.includes(
					session.id
				)
					? 'border-accent bg-shade-0 text-active'
					: 'border-shade-3 text-muted hover:text-active'}"
			>
				{initial(session)}
			</button>
		{/each}
	{/if}
</div>
