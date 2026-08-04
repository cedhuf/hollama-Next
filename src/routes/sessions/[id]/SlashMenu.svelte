<script lang="ts">
	import LL from '$i18n/i18n-svelte';
	import type { SlashCommand } from '$lib/chat/commands';
	import Kbd from '$lib/components/Kbd.svelte';

	/**
	 * Autocomplete for slash commands, docked above the composer.
	 *
	 * Shown only while the prompt is a bare `/word` — the moment a space or a
	 * second line is typed, the caller stops rendering it, because from then on
	 * the user is writing a message, not naming a command.
	 *
	 * Keyboard handling lives in the composer's `onkeydown`, next to the Enter
	 * handling it has to win against; this component owns the list and the mouse.
	 */
	interface Props {
		commands: SlashCommand[];
		/** Index of the highlighted row, owned by the composer. */
		selected: number;
		onPick: (command: SlashCommand) => void;
		onHover: (index: number) => void;
	}

	let { commands, selected, onPick, onHover }: Props = $props();
</script>

<div
	class="flex flex-col rounded-xl border border-shade-3 bg-shade-0 p-1.5 shadow-lg"
	role="listbox"
	aria-label={$LL.slashCommands()}
>
	{#each commands as command, i (command.name)}
		<!-- A command that cannot run right now stays on the list, dimmed and saying
		     why. Hiding it would read as the feature being missing or broken. -->
		<button
			type="button"
			role="option"
			disabled={!command.available}
			aria-selected={i === selected}
			onclick={() => onPick(command)}
			onmousemove={() => command.available && onHover(i)}
			class="flex items-baseline gap-3 rounded-md px-2.5 py-2 text-left transition-colors {i ===
			selected
				? 'bg-shade-1'
				: ''} {command.available ? '' : 'cursor-default opacity-50'}"
		>
			<span class="shrink-0 font-mono text-sm {command.available ? 'text-active' : 'text-muted'}">
				/{command.name}
			</span>
			<span class="min-w-0 flex-1 truncate text-xs text-muted">
				{command.available ? command.description : (command.unavailableReason ?? '')}
			</span>
		</button>
	{/each}

	<p class="flex items-center gap-1.5 px-2.5 pb-0.5 pt-1.5 text-[11px] text-muted">
		<Kbd>↑</Kbd><Kbd>↓</Kbd>
		<span>{$LL.searchNavigate()}</span>
		<Kbd>↵</Kbd>
		<span>{$LL.slashRun()}</span>
	</p>
</div>
