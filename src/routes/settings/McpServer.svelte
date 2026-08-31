<script lang="ts">
	import { Check, KeyRound, LoaderCircle, Plug, X } from '@lucide/svelte';

	import LL from '$i18n/i18n-svelte';
	import Button from '$lib/components/Button.svelte';
	import ButtonConfirm from '$lib/components/ButtonConfirm.svelte';
	import { MCP_TOOL_PREFIX, type McpServerView } from '$lib/mcp';

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
	export type Verdict = {
		ok: boolean;
		tools?: string[];
		total?: number;
		cap?: number | null;
		error?: string;
	};

	interface Props {
		server: McpServerView;
		/** Typed but not yet stored. Sent once, then cleared by the parent. */
		secret: string;
		/** Open on arrival, for the one that was just added. */
		startOpen?: boolean;
		/**
		 * What a test said before this card existed, for the server just added.
		 *
		 * Only the starting value: what a test says from here on is this card's own
		 * business. Bound to the parent it could not be, since a map has no entry for
		 * a server nobody has tested and `bind:` will not take `undefined` against a
		 * prop that defaults to something.
		 */
		initialVerdict?: Verdict | null;
		onChange: () => void;
		onSecret: (value: string) => void;
		onDelete: () => void;
		onVerify: () => Promise<Verdict>;
	}

	let {
		server = $bindable(),
		secret,
		startOpen = false,
		initialVerdict = null,
		onChange,
		onSecret,
		onDelete,
		onVerify
	}: Props = $props();

	// svelte-ignore state_referenced_locally
	let open = $state(startOpen);
	// svelte-ignore state_referenced_locally
	let verdict = $state<Verdict | null>(initialVerdict);
	let verifying = $state(false);
	let replacingKey = $state(false);

	/** Whether a turn can actually reach it, which needs both switches to agree. */
	const runs = $derived(server.enabled && !server.blocked);

	/**
	 * The one line under the name.
	 *
	 * What it says depends on what there is to say, in the order somebody would
	 * want to hear it: a suspension first, since nothing else matters while it
	 * stands, then the size of the catalogue once it has been asked for, and the
	 * address the rest of the time.
	 */
	const summary = $derived.by(() => {
		if (server.blocked) return $LL.mcpBlockedByAdmin();
		if (verdict?.ok) return $LL.mcpToolsFound({ count: verdict.total ?? 0 });
		try {
			return new URL(server.url).host;
		} catch {
			return server.url;
		}
	});

	const keyIsStored = $derived(server.hasSecret && !replacingKey && !secret);

	/** A stored answer stops being true the moment the address or the token changes. */
	function invalidate() {
		verdict = null;
	}

	async function verify() {
		verifying = true;
		verdict = null;
		try {
			verdict = await onVerify();
		} finally {
			verifying = false;
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
			class="text-active placeholder:text-active hover:border-shade-3 focus:border-shade-3 focus:bg-shade-1 pointer-events-auto relative -mx-2 field-sizing-content max-w-full rounded-md border border-transparent px-2 py-0.5 text-sm font-medium outline-none"
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
				invalidate();
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
						invalidate();
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

			<!-- The answer lands in the button that asked the question. The three
			     wordings are stacked in one cell and only one is shown, so the button is
			     as wide as the longest of them in whatever language it is read in, and
			     changing state cannot move the field beside it. -->
			<Button
				variant="outline"
				onclick={verify}
				disabled={verifying || !server.url}
				title={verdict?.ok
					? $LL.mcpToolsFound({ count: verdict.total ?? 0 })
					: (verdict?.error ?? $LL.checkConnection())}
				class={verdict?.ok
					? 'border-positive! text-positive! hover:border-positive! hover:text-positive!'
					: verdict
						? 'border-negative! text-negative! hover:border-negative! hover:text-negative!'
						: ''}
			>
				{#if verifying}
					<LoaderCircle class="base-icon animate-spin" />
				{:else if verdict?.ok}
					<Check class="base-icon" />
				{:else}
					<Plug class="base-icon" />
				{/if}
				<span class="grid text-center">
					<span class="col-start-1 row-start-1 {verdict?.ok ? '' : 'invisible'}">
						{$LL.connected()}
					</span>
					<span class="col-start-1 row-start-1 {verdict && !verdict.ok ? '' : 'invisible'}">
						{$LL.connectionFailed()}
					</span>
					<span class="col-start-1 row-start-1 {verdict ? 'invisible' : ''}">
						{$LL.checkConnection()}
					</span>
				</span>
			</Button>
		</div>
		<!-- Failures keep their own line: a server says why in a sentence, and a
		     sentence does not fit in a button. -->
		{#if verdict && !verdict.ok}
			<span class="text-negative text-xs">{verdict.error}</span>
		{/if}
	</SettingsField>

	<!-- What came back, which is the answer people actually wanted: "connected" says
	     the address is right, the names say it is the server they meant. -->
	{#if verdict?.ok && verdict.tools?.length}
		<div class="flex flex-wrap gap-1.5">
			{#each verdict.tools as tool (tool)}
				<span class="bg-shade-2 text-muted max-w-[15rem] truncate rounded-full px-2 py-0.5 text-xs">
					{tool}
				</span>
			{/each}
		</div>
		{#if verdict.cap}
			<span class="text-muted text-xs leading-snug">
				{$LL.mcpToolsCapped({ count: verdict.cap })}
			</span>
		{/if}
	{/if}

	{#if server.blocked}
		<span class="text-muted text-xs leading-snug">{$LL.mcpBlockedByAdmin()}</span>
	{/if}

	<div class="border-shade-3 flex flex-wrap items-center gap-x-4 gap-y-2 border-t pt-3">
		<!-- What the model will see these tools called. Shown because the name is
		     derived, and because a suffixed slug is otherwise a surprise found in a
		     trace. -->
		<span class="text-muted min-w-0 truncate text-xs">
			{$LL.mcpToolPrefix({ prefix: `${MCP_TOOL_PREFIX}_${server.slug}_` })}
		</span>

		<div class="ml-auto flex items-center gap-2">
			<ButtonConfirm onConfirm={onDelete} label={$LL.deleteMcpServer()} />
		</div>
	</div>
</SettingsCard>
