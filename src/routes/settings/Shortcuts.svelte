<script lang="ts">
	import LL from '$i18n/i18n-svelte';
	import Kbd from '$lib/components/Kbd.svelte';
	import { modKey } from '$lib/platform';

	import SettingsSection from './SettingsSection.svelte';

	/**
	 * The shortcuts the app actually listens for.
	 *
	 * Read-only for now, and written from the handlers rather than from memory —
	 * a shortcut list that drifts from the code is worse than none, because it
	 * teaches the wrong thing. Each group below names where its keys are handled.
	 */

	const mod = $derived(modKey());

	interface Shortcut {
		keys: string[];
		label: string;
	}

	const groups = $derived<{ title: string; shortcuts: Shortcut[]; note?: string }[]>([
		{
			// src/routes/+layout.svelte
			title: $LL.shortcutsGlobal(),
			shortcuts: [{ keys: [mod, 'K'], label: $LL.searchConversations() }]
		},
		{
			// src/routes/sessions/[id]/Prompt.svelte
			title: $LL.shortcutsComposer(),
			shortcuts: [
				{ keys: ['↵'], label: $LL.shortcutSendMessage() },
				{ keys: ['⇧', '↵'], label: $LL.shortcutNewLine() }
			],
			note: $LL.shortcutExpandedNote({ mod })
		},
		{
			// src/routes/sessions/[id]/Prompt.svelte + SlashMenu.svelte
			title: $LL.shortcutsCommands(),
			shortcuts: [
				{ keys: ['↑', '↓'], label: $LL.searchNavigate() },
				{ keys: ['⇥'], label: $LL.shortcutCompleteCommand() },
				{ keys: ['↵'], label: $LL.slashRun() },
				{ keys: ['esc'], label: $LL.searchClose() }
			],
			note: $LL.shortcutCommandsNote()
		},
		{
			// src/lib/components/SearchModal.svelte
			title: $LL.shortcutsSearch(),
			shortcuts: [
				{ keys: ['↑', '↓'], label: $LL.searchNavigate() },
				{ keys: ['↵'], label: $LL.searchOpen() },
				{ keys: ['esc'], label: $LL.searchClose() }
			]
		},
		{
			// src/routes/settings/SettingsModal.svelte
			title: $LL.shortcutsDialogs(),
			shortcuts: [
				{ keys: ['↑', '↓'], label: $LL.shortcutMoveBetweenTabs() },
				{ keys: ['esc'], label: $LL.searchClose() }
			]
		}
	]);
</script>

<SettingsSection
	title={$LL.keyboardShortcuts()}
	description={$LL.keyboardShortcutsDescription()}
	card
>
	<div class="flex flex-col gap-4">
		{#each groups as group (group.title)}
			<div class="flex flex-col gap-1.5">
				<h4 class="text-xs font-medium uppercase tracking-wide text-muted">{group.title}</h4>

				{#each group.shortcuts as shortcut (shortcut.label)}
					<!-- Label left, keys right: the eye scans the actions, and only stops on
					     the keys for the one it wants. -->
					<div class="flex items-baseline gap-3 text-sm">
						<span class="min-w-0 flex-1 truncate">{shortcut.label}</span>
						<span class="flex shrink-0 items-center gap-1">
							{#each shortcut.keys as key (key)}
								<Kbd>{key}</Kbd>
							{/each}
						</span>
					</div>
				{/each}

				{#if group.note}
					<p class="text-xs leading-snug text-muted">{group.note}</p>
				{/if}
			</div>
		{/each}
	</div>
</SettingsSection>
