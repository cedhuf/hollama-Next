<script lang="ts">
	import { ChevronDown } from '@lucide/svelte';

	import LL from '$i18n/i18n-svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { sessionsStore, settingsStore } from '$lib/localStorage';
	import { launchPersona, unbindPersonaSession, type Persona } from '$lib/personas';

	import ContextMenu from './ContextMenu.svelte';
	import PersonaAvatar from './PersonaAvatar.svelte';
	import SessionMenu from './SessionMenu.svelte';

	interface Props {
		personas: Persona[];
		/** Two presentations of one list, never both at once: a named grid, or the row of avatars the compact header asks for. What a launcher does, and what makes it look active, is written once either way. */
		shape: 'grid' | 'strip';
		/** Grid only. A search is running, so the section opens whatever the toggle last said. */
		forceOpen?: boolean;
	}

	let { personas, shape, forceOpen = false }: Props = $props();

	let sectionOpen = $state(true);
	const open = $derived(sectionOpen || forceOpen);

	const pathname = $derived(page.url.pathname);
	const isActive = (persona: Persona) =>
		!!persona.sessionId && pathname.includes(persona.sessionId);

	/** Five to a row, always, with the last row centred: the cell is the same width whether there are two personas or twenty. Balanced rows changed the avatars' size as the list grew. */
	const COLUMNS = 5;

	async function launch(persona: Persona) {
		const id = await launchPersona(persona, $settingsStore.models);
		goto(resolve('/sessions/[id]', { id }));
	}

	/**
	 * A launcher is a conversation, so it answers a right-click like one, plus the
	 * one thing only a persona has: ending it. That is not deletion and must not
	 * read as it, so they are separate entries with the destructive one last.
	 *
	 * Drawn only once the persona has a conversation.
	 */
	const sessionOf = (persona: Persona) =>
		persona.sessionId
			? ($sessionsStore ?? []).find((session) => session.id === persona.sessionId)
			: undefined;

	function endConversation(persona: Persona) {
		unbindPersonaSession(persona.sessionId ?? '');
	}

	function deleteConversation(persona: Persona) {
		if (!persona.sessionId) return;
		const isOpen = pathname.includes(persona.sessionId);
		sessionsStore.remove(persona.sessionId);
		unbindPersonaSession(persona.sessionId);
		if (isOpen) void goto(resolve('/sessions'));
	}
</script>

{#if personas.length > 0}
	{#if shape === 'grid'}
		<div class="px-2 py-2">
			<button
				type="button"
				onclick={() => (sectionOpen = !sectionOpen)}
				class="text-accent hover:bg-shade-0 flex w-full items-center justify-between rounded-md px-2 py-1.5 text-[11px] font-semibold tracking-wider uppercase transition-colors"
			>
				<span>{$LL.personas()} · {personas.length}</span>
				<ChevronDown class="h-3.5 w-3.5 transition-transform {open ? '' : '-rotate-90'}" />
			</button>
			{#if open}
				<!-- Five to a row, a partial row centred. -->
				<div class="flex flex-wrap justify-center gap-1 pt-1 pb-1">
					{#each personas as persona (persona.id)}
						{@const session = sessionOf(persona)}
						<ContextMenu>
							{#snippet trigger({ props })}
								<button
									{...props}
									type="button"
									onclick={() => launch(persona)}
									style="flex: 0 0 calc(100% / {COLUMNS} - 0.25rem)"
									class="persona-launcher group flex flex-col items-center gap-1.5 rounded-xl px-1 py-2 outline-none"
									title={persona.tagline || persona.name}
								>
									<span
										class="ring-offset-shade-1 relative inline-flex rounded-full ring-offset-2 transition duration-150 group-hover:scale-105 motion-reduce:transition-none {isActive(
											persona
										)
											? 'ring-accent ring-2'
											: 'group-hover:ring-shade-4 group-focus-visible:ring-accent group-hover:ring-2 group-focus-visible:ring-2'}"
									>
										<PersonaAvatar {persona} size={44} />
									</span>
									<span
										class="w-full truncate text-center text-xs transition-colors {isActive(persona)
											? 'text-active font-medium'
											: 'text-muted group-hover:text-active'}"
									>
										{persona.name}
									</span>
								</button>
							{/snippet}

							{#if session}
								<SessionMenu
									id={session.id}
									pinned={session.pinned}
									archived={session.archived}
									onClose={() => endConversation(persona)}
									onDelete={() => deleteConversation(persona)}
								/>
							{/if}
						</ContextMenu>
					{/each}
				</div>
			{/if}
		</div>
	{:else}
		<!-- Spread rather than stacked left: four avatars bunched in a corner read as a
		     leftover. `justify-evenly` gives way to scrolling once they no longer fit.

		     The vertical padding is not decoration: asking for horizontal overflow clips
		     the vertical one too, and the ring is drawn 4px outside the avatar. -->
		<div class="flex justify-evenly gap-1.5 overflow-x-auto px-3 py-2">
			{#each personas as persona (persona.id)}
				{@const session = sessionOf(persona)}
				<ContextMenu>
					{#snippet trigger({ props })}
						<button
							{...props}
							type="button"
							onclick={() => launch(persona)}
							title={persona.name}
							aria-label={persona.name}
							class="persona-launcher ring-offset-shade-1 shrink-0 rounded-full ring-offset-2 transition duration-150 outline-none hover:scale-105 motion-reduce:transition-none {isActive(
								persona
							)
								? 'ring-accent ring-2'
								: 'hover:ring-shade-4 focus-visible:ring-accent hover:ring-2 focus-visible:ring-2'}"
						>
							<PersonaAvatar {persona} size={28} />
						</button>
					{/snippet}

					{#if session}
						<SessionMenu
							id={session.id}
							pinned={session.pinned}
							archived={session.archived}
							onClose={() => endConversation(persona)}
							onDelete={() => deleteConversation(persona)}
						/>
					{/if}
				</ContextMenu>
			{/each}
		</div>
	{/if}
{/if}

<style>
	/* The same reason the list rows do it: iOS answers a long press on an image
	   with its own preview sheet, which swallows the press before the context menu
	   can open. A launcher is a target, not a passage. */
	.persona-launcher {
		-webkit-touch-callout: none;
		-webkit-user-select: none;
		user-select: none;
	}
</style>
