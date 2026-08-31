<script lang="ts">
	import { KeyRound, LoaderCircle, Plug, RefreshCw, X } from '@lucide/svelte';
	import { slide } from 'svelte/transition';

	import LL from '$i18n/i18n-svelte';
	import Button from '$lib/components/Button.svelte';
	import ButtonConfirm from '$lib/components/ButtonConfirm.svelte';
	import { groupMcpTools, type McpServerView } from '$lib/mcp';

	import SettingsCard from './SettingsCard.svelte';
	import SettingsField from './SettingsField.svelte';

	/**
	 * One configured MCP server: a line, and its settings underneath when asked for.
	 *
	 * The card itself is `SettingsCard`, the same one a connection and a bot use.
	 * What is left here is what an MCP server is about: an address, a token, and
	 * the catalogue that comes back when you test it.
	 *
	 * Everything is saved as it is typed, debounced by the parent. The token is the
	 * exception, because it is never read back: an untouched field means "keep what
	 * is stored", and only a typed value replaces it.
	 */
	interface Props {
		server: McpServerView;
		/** Typed but not yet stored. Sent once, then cleared by the parent. */
		secret: string;
		/** Open on arrival, for the one that was just added. */
		startOpen?: boolean;
		onChange: () => void;
		onSecret: (value: string) => void;
		onDelete: () => void;
		/** Ask the server what it offers now. Answers with the stored list, or why not. */
		onRefresh: () => Promise<{ ok: boolean; server?: McpServerView; error?: string }>;
	}

	let {
		server = $bindable(),
		secret,
		startOpen = false,
		onChange,
		onSecret,
		onDelete,
		onRefresh
	}: Props = $props();

	// svelte-ignore state_referenced_locally
	let open = $state(startOpen);
	let showAdvanced = $state(false);
	let refreshing = $state(false);
	let failure = $state<string | null>(null);
	let replacingKey = $state(false);

	/** Whether a turn can actually reach it, which needs both switches to agree. */
	const runs = $derived(server.enabled && !server.blocked);

	/**
	 * The one line under the name.
	 *
	 * What it says depends on what there is to say, in the order somebody would
	 * want to hear it: a suspension first, since nothing else matters while it
	 * stands, then the size of its catalogue, which is the question the card exists
	 * to answer, and the address while nobody has asked yet.
	 */
	const summary = $derived.by(() => {
		if (server.blocked) return $LL.mcpBlockedByAdmin();
		if (server.toolsAt) return $LL.mcpToolsFound({ count: enabledCount });
		try {
			return new URL(server.url).host;
		} catch {
			return server.url;
		}
	});

	const keyIsStored = $derived(server.hasSecret && !replacingKey && !secret);

	const groups = $derived(groupMcpTools(server.tools));

	/** Whether a group's tools are offered to a turn at all. */
	const isOn = (group: string) => !server.disabledGroups.includes(group);

	/** How many tools a turn would actually be given, once the off groups are out. */
	const enabledCount = $derived(
		groups.reduce((total, { group, tools }) => total + (isOn(group) ? tools.length : 0), 0)
	);

	/**
	 * Switch a whole group on or off.
	 *
	 * The group is the unit, because behind a gateway a group is a server: all of
	 * the house or none of it is the choice people make, and thirty checkboxes to
	 * say it is a worse way of saying the same thing.
	 */
	function setGroup(group: string, on: boolean) {
		server.disabledGroups = on
			? server.disabledGroups.filter((name) => name !== group)
			: [...new Set([...server.disabledGroups, group])];
		onChange();
	}

	/**
	 * Ask the server what it offers now.
	 *
	 * The same button whether it is the first time or the tenth: a gateway gains
	 * and loses tools without telling anybody, so "does this work" and "what does
	 * it have today" are the same question asked twice.
	 */
	async function refresh() {
		refreshing = true;
		failure = null;
		try {
			const answer = await onRefresh();
			if (answer.ok && answer.server) server = answer.server;
			else failure = answer.error ?? $LL.connectionFailed();
		} finally {
			refreshing = false;
		}
	}
</script>

<SettingsCard
	bind:open
	label={$LL.mcpServerOptions()}
	bind:enabled={server.enabled}
	enabledLabel={$LL.mcpEnabled()}
	enabledDisabled={server.blocked}
	onToggle={onChange}
	healthy={runs}
	iconClass="bg-shade-2 {runs ? 'text-positive' : 'text-muted'}"
>
	{#snippet icon()}
		<Plug class="base-icon" />
	{/snippet}

	{#snippet title()}
		<input
			class="text-active placeholder:text-active hover:border-shade-3 focus:border-shade-3 focus:bg-shade-1 pointer-events-auto relative -mx-2 box-content field-sizing-content max-w-full rounded-md border border-transparent px-2 py-0.5 text-sm font-medium outline-none"
			size={(server.label || 'MCP').length + 1}
			bind:value={server.label}
			oninput={onChange}
			placeholder="MCP"
			aria-label={$LL.label()}
		/>
	{/snippet}

	{#snippet subtitle()}
		<span class="truncate">{summary}</span>
	{/snippet}

	<SettingsField label={$LL.mcpServerUrl()}>
		<input
			class="settings-field font-mono text-xs"
			bind:value={server.url}
			oninput={() => {
				// Only the last failure: the stored catalogue is still the last thing this
				// server actually answered, and typing an address does not make it untrue.
				// What retakes the snapshot is the button below.
				failure = null;
				onChange();
			}}
			placeholder="https://mcp.example.com/mcp"
			spellcheck="false"
		/>
	</SettingsField>

	<!-- The token and the button that proves it, on one line: "is this right?" is a
	     question about the field it sits next to. -->
	<SettingsField label={$LL.mcpToken()}>
		<div class="flex items-center gap-2">
			{#if keyIsStored}
				<div
					class="border-shade-3 bg-shade-1 flex flex-1 items-center gap-2 rounded-md border px-2.5 py-1.5"
				>
					<KeyRound class="text-positive h-3.5 w-3.5 shrink-0" />
					<span class="text-muted flex-1 text-sm">{$LL.apiKeySaved()}</span>
					<button type="button" onclick={() => (replacingKey = true)} class="text-link text-xs">
						{$LL.apiKeyReplace()}
					</button>
				</div>
			{:else}
				<input
					class="settings-field flex-1"
					type="password"
					autocomplete="off"
					value={secret}
					oninput={(e) => {
						failure = null;
						onSecret(e.currentTarget.value);
					}}
				/>
				{#if server.hasSecret}
					<button
						type="button"
						onclick={() => {
							onSecret('');
							replacingKey = false;
						}}
						aria-label={$LL.apiKeyKeep()}
						title={$LL.apiKeyKeep()}
						class="text-muted hover:text-active shrink-0 rounded-md p-1.5 transition-colors"
					>
						<X class="h-4 w-4" />
					</button>
				{/if}
			{/if}

			<!-- One button for two questions that are the same question: does this
			     answer, and what does it have today. A gateway gains and loses tools
			     without telling anybody, so this is pressed again long after the first
			     time. -->
			<Button variant="outline" onclick={refresh} disabled={refreshing || !server.url}>
				{#if refreshing}
					<LoaderCircle class="base-icon animate-spin" />
				{:else}
					<RefreshCw class="base-icon" />
				{/if}
				{$LL.mcpUpdateTools()}
			</Button>
		</div>
		<!-- Failures keep their own line: a server says why in a sentence, and a
		     sentence does not fit in a button. -->
		{#if failure}
			<span class="text-negative text-xs">{failure}</span>
		{/if}
	</SettingsField>

	{#if server.blocked}
		<span class="text-muted text-xs leading-snug">{$LL.mcpBlockedByAdmin()}</span>
	{/if}

	<!-- Behind the same disclosure a connection and a bot put their rarer settings
	     behind, in the same place and with the same wording: what is on a card by
	     default should be what you came for, and thirty tool names is not that. The
	     count itself is already on the closed card.

	     Grouped by the prefix a gateway puts on its tools, which is the only thing
	     saying that these three came from the mail and those thirty from the house.
	     A reading habit, not a fact: it arranges the list and carries the switch. -->
	{#if showAdvanced && server.toolsAt}
		<div
			class="border-shade-3 flex flex-col gap-3 border-t pt-3"
			transition:slide={{ duration: 150 }}
		>
			{#each groups as { group, tools } (group)}
				<div class="flex flex-col gap-1.5">
					<label class="flex cursor-pointer items-center justify-between gap-2">
						<span class="text-active min-w-0 truncate text-xs font-medium">
							{group || $LL.mcpUngrouped()}
							<span class="text-muted font-normal">· {tools.length}</span>
						</span>
						<input
							type="checkbox"
							checked={isOn(group)}
							onchange={(e) => setGroup(group, e.currentTarget.checked)}
							aria-label={group || $LL.mcpUngrouped()}
							class="peer sr-only"
						/>
						<span
							class="bg-shade-3 peer-checked:bg-accent peer-focus-visible:ring-accent relative h-5 w-9 shrink-0 rounded-full transition-colors peer-focus-visible:ring-2 after:absolute after:top-0.5 after:left-0.5 after:h-4 after:w-4 after:rounded-full after:bg-white after:transition-transform peer-checked:after:translate-x-4"
						></span>
					</label>

					<!-- The names, for reading rather than for choosing: what the switch
					     above actually covers. Faded when it is off, since none of them is
					     being offered to anything. -->
					<div class="flex flex-wrap gap-1.5 {isOn(group) ? '' : 'opacity-40'}">
						{#each tools as tool (tool)}
							<span
								class="bg-shade-2 text-muted max-w-[15rem] truncate rounded-full px-2 py-0.5 text-xs"
							>
								{group ? tool.slice(group.length + 1) : tool}
							</span>
						{/each}
					</div>
				</div>
			{:else}
				<span class="text-muted text-xs">{$LL.mcpNoTools()}</span>
			{/each}

			<span class="text-muted text-xs leading-snug">
				{$LL.mcpToolsAsOf({ date: new Date(server.toolsAt).toLocaleString() })}
			</span>
		</div>
	{/if}

	<!-- Footer: the occasional actions, kept out of the way of the fields. -->
	<div class="border-shade-3 flex flex-wrap items-center gap-x-4 gap-y-2 border-t pt-3">
		{#if server.toolsAt}
			<button
				type="button"
				onclick={() => (showAdvanced = !showAdvanced)}
				class="text-muted hover:text-active text-xs transition-colors"
			>
				{$LL.advancedSettings()}
			</button>
		{/if}

		<div class="ml-auto flex items-center gap-2">
			<ButtonConfirm onConfirm={onDelete} label={$LL.deleteMcpServer()} />
		</div>
	</div>
</SettingsCard>
