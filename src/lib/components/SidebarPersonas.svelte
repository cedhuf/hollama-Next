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
		/**
		 * Two presentations of one list, never both at once: a named grid, or the row
		 * of avatars the compact header asks for. Both hold the same place above the
		 * conversations, and both answer the same way: the avatar lifts and takes a
		 * ring, rather than a filled rectangle appearing behind it. What a launcher
		 * does, and what makes it look active, is written once either way.
		 */
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

	/**
	 * Five to a row, always, and the last row centred on whatever is left.
	 *
	 * The cell is therefore the same width whether there are two personas or
	 * twenty, which is what makes the block read as a grid rather than as a
	 * different arrangement each time one is added. Rows used to be balanced
	 * instead, six going to three and three rather than five and one, and the
	 * avatars changed size as the list grew.
	 */
	const COLUMNS = 5;

	function launch(persona: Persona) {
		goto(resolve('/sessions/[id]', { id: launchPersona(persona, $settingsStore.models) }));
	}

	/**
	 * A launcher is a conversation, so it answers a right-click like one.
	 *
	 * Everything a conversation offers, plus the one thing only a persona has:
	 * ending it. That is not deletion and must not read as it, which is why they
	 * are separate entries with the destructive one last. Ending puts the persona
	 * back to unstarted and leaves the transcript in the list as an ordinary
	 * conversation; deleting is what loses it.
	 *
	 * The menu is only drawn once the persona has a conversation. Before that there
	 * is nothing to pin, export, end or delete.
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
				class="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-accent transition-colors hover:bg-shade-0"
			>
				<span>{$LL.personas()} · {personas.length}</span>
				<ChevronDown class="h-3.5 w-3.5 transition-transform {open ? '' : '-rotate-90'}" />
			</button>
			{#if open}
				<!-- iOS Messages-style grid: five to a row, a partial row centred. -->
				<div class="flex flex-wrap justify-center gap-1 pb-1 pt-1">
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
										class="relative inline-flex rounded-full ring-offset-2 ring-offset-shade-1 transition duration-150 group-hover:scale-105 motion-reduce:transition-none {isActive(
											persona
										)
											? 'ring-2 ring-accent'
											: 'group-hover:ring-2 group-hover:ring-shade-4 group-focus-visible:ring-2 group-focus-visible:ring-accent'}"
									>
										<PersonaAvatar {persona} size={44} />
									</span>
									<span
										class="w-full truncate text-center text-xs transition-colors {isActive(persona)
											? 'font-medium text-active'
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
		<!-- Spread rather than stacked to the left: four avatars bunched in a corner
		     read as a leftover, the same four spaced across the width read as a row.
		     `justify-evenly` gives way to scrolling once they no longer fit, which is
		     the point at which even spacing stops being possible.
		     The vertical padding is not decoration: asking for horizontal overflow clips
		     the vertical one too, and the avatars reach past their own box on both
		     counts. The ring is drawn 4px outside, and the lift then scales that whole
		     circle by a twentieth, which puts the far edge at just under 5px. Eight
		     leaves the room, and the same on each side so nothing sits off-centre. -->
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
							class="persona-launcher shrink-0 rounded-full outline-none ring-offset-2 ring-offset-shade-1 transition duration-150 hover:scale-105 motion-reduce:transition-none {isActive(
								persona
							)
								? 'ring-2 ring-accent'
								: 'hover:ring-2 hover:ring-shade-4 focus-visible:ring-2 focus-visible:ring-accent'}"
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
