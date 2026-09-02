<script lang="ts">
	import { House, ImageIcon, Library, MoreHorizontal, Plus, Search } from '@lucide/svelte';

	import LL from '$i18n/i18n-svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { canDrawImages } from '$lib/images';
	import { sessionsStore, settingsStore } from '$lib/localStorage';
	import { launchPersona, unbindPersonaSession, type Persona } from '$lib/personas';
	import { resolveSessionTitle, type SessionSummary } from '$lib/sessions';
	import { openSearch } from '$lib/stores/modal';

	import ContextMenu from './ContextMenu.svelte';
	import PersonaAvatar from './PersonaAvatar.svelte';
	import Popover from './Popover.svelte';
	import SessionMenu from './SessionMenu.svelte';
	import Tooltip from './Tooltip.svelte';

	interface Props {
		personas: Persona[];
		/** Every conversation. How many of them fit one lane is this component's business. */
		sessions: SessionSummary[];
		onNewChat: () => void;
	}

	let { personas, sessions, onNewChat }: Props = $props();

	/** A single letter in a box is a reminder, not a name: it works for the handful you were just in and stops long before the list does. The rest are one click away, with their titles. */
	const RAIL_RECENT = 4;

	const recent = $derived(sessions.filter((session) => !session.archived).slice(0, RAIL_RECENT));

	/** A launcher's conversation, when it has one: without it there is no menu to draw. */
	const sessionOf = (persona: Persona) =>
		persona.sessionId ? sessions.find((session) => session.id === persona.sessionId) : undefined;

	function deleteConversation(persona: Persona) {
		if (!persona.sessionId) return;
		const isOpen = pathname.includes(persona.sessionId);
		sessionsStore.remove(persona.sessionId);
		unbindPersonaSession(persona.sessionId);
		if (isOpen) void goto(resolve('/sessions'));
	}
	let browsing = $state(false);

	const pathname = $derived(page.url.pathname);
	const onLibrary = $derived(pathname.includes('/library') || pathname.includes('/knowledge'));
	const onHome = $derived(pathname.includes('/sessions'));

	function initial(session: SessionSummary): string {
		return (resolveSessionTitle(session).trim().charAt(0) || '#').toUpperCase();
	}

	function open(id: string) {
		browsing = false;
		goto(resolve('/sessions/[id]', { id }));
	}

	/** Awaited, so the conversation exists before the page that reads it opens. */
	async function launch(persona: Persona) {
		const id = await launchPersona(persona, $settingsStore.models);
		goto(resolve('/sessions/[id]', { id }));
	}
</script>

<!-- The whole column in one lane: the primary actions, then the launchers the
     full width shows.

     Every target is a picture of itself, so each needs its name said somewhere. A
     `title` would do it for a mouse and for nobody else. These are the app's own
     tooltips, opening on focus as readily as on hover. -->
<div class="surface-column min-h-0 flex-1 overflow-y-auto" style="overflow-x: hidden">
	<!-- Full width for the material, fixed width for the layout: see `SidebarBrand`. -->
	<div class="flex w-full flex-col items-center gap-1.5 py-3 lg:w-16">
		<Tooltip side="right">
			{#snippet trigger({ props })}
				<button
					{...props}
					onclick={onNewChat}
					aria-label={$LL.newChat()}
					class="bg-accent text-shade-0 flex h-9 w-9 items-center justify-center rounded-lg transition-opacity hover:opacity-90"
				>
					<Plus class="h-5 w-5" />
				</button>
			{/snippet}
			{$LL.newChat()}
		</Tooltip>

		<!-- Directly under New chat and in its colour: folded, this rail is the same two
		     gestures the expanded header offers as one split button. Tinted rather than
		     filled, so the pair still has one primary end.

		     No active state: it is not a third destination beside Chats and Library. -->
		{#if $canDrawImages}
			<Tooltip side="right">
				{#snippet trigger({ props })}
					<a
						{...props}
						href={resolve('/images')}
						aria-label={$LL.imageGenerate()}
						class="bg-accent/15 text-accent hover:bg-accent/25 flex h-9 w-9 items-center justify-center rounded-lg transition-colors"
					>
						<ImageIcon class="h-5 w-5" />
					</a>
				{/snippet}
				{$LL.imageGenerate()}
			</Tooltip>
		{/if}

		<!-- The full-text search, which at this width is the whole of the search: there
		     is no room for a field, and the field was only the way in to this. -->
		<Tooltip side="right">
			{#snippet trigger({ props })}
				<button
					{...props}
					type="button"
					onclick={() => openSearch()}
					aria-label={$LL.search()}
					class="text-muted hover:text-active flex h-9 w-9 items-center justify-center rounded-lg transition-colors"
				>
					<Search class="h-5 w-5" />
				</button>
			{/snippet}
			{$LL.search()}
		</Tooltip>

		<Tooltip side="right">
			{#snippet trigger({ props })}
				<a
					{...props}
					href={resolve('/sessions')}
					aria-label={$LL.home()}
					class="flex h-9 w-9 items-center justify-center rounded-lg transition-colors {onHome
						? 'bg-shade-0 text-active'
						: 'text-muted hover:text-active'}"
				>
					<House class="h-5 w-5" />
				</a>
			{/snippet}
			{$LL.home()}
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
			<div class="bg-shade-3 my-1 h-px w-8"></div>
			{#each personas as persona (persona.id)}
				{@const session = sessionOf(persona)}
				<!-- The same menu the open column gives it, since it is the same thing:
				     narrowing the sidebar is not meant to take actions away. -->
				<ContextMenu>
					{#snippet trigger({ props: menuProps })}
						<Tooltip side="right" class="w-56">
							{#snippet trigger({ props })}
								<button
									{...menuProps}
									{...props}
									type="button"
									onclick={() => launch(persona)}
									aria-label={persona.name}
									class="persona-launcher focus-visible:ring-accent focus-visible:ring-offset-shade-1 rounded-full transition duration-150 outline-none hover:scale-105 focus-visible:ring-2 focus-visible:ring-offset-2 motion-reduce:transition-none"
								>
									<PersonaAvatar {persona} size={32} />
								</button>
							{/snippet}
							<!-- Its name first: at this width the avatar is all there is, so the tooltip is
							     where the persona says who it is before saying what it is for. -->
							<span class="text-active block font-medium">{persona.name}</span>
							{#if persona.tagline}
								<span class="text-muted mt-0.5 block">{persona.tagline}</span>
							{/if}
						</Tooltip>
					{/snippet}

					{#if session}
						<SessionMenu
							id={session.id}
							pinned={session.pinned}
							archived={session.archived}
							onClose={() => unbindPersonaSession(persona.sessionId ?? '')}
							onDelete={() => deleteConversation(persona)}
						/>
					{/if}
				</ContextMenu>
			{/each}
		{/if}

		{#if recent.length > 0}
			<div class="bg-shade-3 my-1 h-px w-8"></div>
			{#each recent as session (session.id)}
				<!-- The right-click menu belongs to a conversation, not to the width it is drawn
				     at. The wrapper is what the gesture targets, so the tooltip inside keeps the
				     button to itself. -->
				<ContextMenu>
					{#snippet trigger({ props })}
						<div {...props}>
							<Tooltip side="right">
								{#snippet trigger({ props: hover })}
									<button
										{...hover}
										type="button"
										onclick={() => open(session.id)}
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

		<!-- The rest of them, borrowed rather than moved into: the panel opens with the
		     titles the lane cannot show and closes on the one you pick. Expanding the
		     sidebar for a single visit is a bigger gesture than the errand deserves. -->
		{#if sessions.length > recent.length}
			<Popover side="right" align="end" class="w-64 p-1.5" bind:open={browsing}>
				{#snippet trigger({ props })}
					<button
						{...props}
						type="button"
						aria-label={$LL.allConversations()}
						class="text-muted flex h-8 w-8 items-center justify-center rounded-md border border-dashed transition-colors {browsing
							? 'border-accent text-active'
							: 'border-shade-3 hover:text-active'}"
					>
						<MoreHorizontal class="base-icon" />
					</button>
				{/snippet}

				<p class="text-muted px-2 py-1 text-[11px] font-semibold tracking-wider uppercase">
					{$LL.allConversations()}
				</p>
				<div class="max-h-[60vh] overflow-auto">
					{#each sessions as session (session.id)}
						<button
							type="button"
							onclick={() => open(session.id)}
							class="hover:bg-shade-1 flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition-colors {pathname.includes(
								session.id
							)
								? 'bg-shade-1 text-active'
								: 'text-muted hover:text-active'}"
						>
							<span class="truncate">{resolveSessionTitle(session) || $LL.untitled()}</span>
						</button>
					{/each}
				</div>
			</Popover>
		{/if}
	</div>
</div>

<style>
	/* iOS answers a long press on an image with its own preview sheet, which
	   swallows the press before the context menu can open. */
	.persona-launcher {
		-webkit-touch-callout: none;
		-webkit-user-select: none;
		user-select: none;
	}
</style>
