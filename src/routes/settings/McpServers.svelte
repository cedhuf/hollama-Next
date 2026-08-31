<script lang="ts">
	import { Check, LoaderCircle, Plus } from '@lucide/svelte';
	import { onMount } from 'svelte';

	import LL from '$i18n/i18n-svelte';
	import Button from '$lib/components/Button.svelte';
	import EmptyMessage from '$lib/components/EmptyMessage.svelte';
	import FieldCheckbox from '$lib/components/FieldCheckbox.svelte';
	import Skeleton from '$lib/components/Skeleton.svelte';
	import { settingsStore } from '$lib/localStorage';
	import { MCP_LIMITS, type McpServerView } from '$lib/mcp';
	import { toast } from '$lib/toast';

	import McpServer, { type Verdict } from './McpServer.svelte';
	import SettingsBadge from './SettingsBadge.svelte';
	import SettingsField from './SettingsField.svelte';
	import SettingsHint from './SettingsHint.svelte';
	import SettingsSection from './SettingsSection.svelte';
	import SettingsSlider from './SettingsSlider.svelte';

	/**
	 * The MCP servers this account calls out to.
	 *
	 * A list of cards and a folded form to add one, like the bots tab and the
	 * connections tab, because it is the same shape of thing: an address, a
	 * credential, and a switch. What differs is that testing one answers a
	 * question worth showing, so the tool names come back and stay on the card.
	 */

	let servers = $state<McpServerView[]>([]);
	let loading = $state(true);
	let canManage = $state(false);
	let limit = $state<number>(MCP_LIMITS.perUser);

	/** Tokens typed but not yet stored, by server id. Never filled from the server. */
	let secrets = $state<Record<string, string>>({});
	/**
	 * What the test run while adding a server said, by server id.
	 *
	 * Only that: from the moment a card exists, its own tests are its own. This is
	 * what lets a server that was just added arrive with the catalogue its creation
	 * test already produced, instead of asking for it again.
	 */
	let verdicts = $state<Record<string, Verdict | null>>({});

	/** The one just added, opened so its settings are where the eye already is. */
	let justAddedId = $state<string | null>(null);
	let adding = $state(false);
	let creating = $state(false);
	let draft = $state({ label: '', url: '', secret: '' });

	async function api<T>(url: string, method: string, body?: unknown): Promise<T | null> {
		const response = await fetch(url, {
			method,
			headers: body ? { 'content-type': 'application/json' } : {},
			body: body ? JSON.stringify(body) : undefined
		});
		if (!response.ok) {
			toast.error($LL.requestFailed(), { description: `HTTP ${response.status}` });
			throw new Error(`HTTP ${response.status}`);
		}
		return response.status === 204 ? null : ((await response.json()) as T);
	}

	async function load() {
		try {
			const config = await api<{ canManage: boolean; limit: number }>('/api/mcp/config', 'GET');
			canManage = config?.canManage ?? false;
			limit = config?.limit ?? MCP_LIMITS.perUser;

			servers = (await api<McpServerView[]>('/api/mcp', 'GET')) ?? [];
		} catch {
			// `api()` has already said what went wrong. An empty list is the honest
			// thing to show when the instance would not answer.
		} finally {
			loading = false;
		}
	}

	onMount(load);

	// Debounced save per server, exactly as a connection saves.
	const timers: Record<string, ReturnType<typeof setTimeout>> = {};
	function persist(server: McpServerView) {
		clearTimeout(timers[server.id]);
		timers[server.id] = setTimeout(async () => {
			const secret = secrets[server.id];
			try {
				const saved = await api<McpServerView>(`/api/mcp/${server.id}`, 'PUT', {
					label: server.label,
					url: server.url,
					enabled: server.enabled,
					// Omitted keeps the stored one. Sent only when somebody typed.
					...(secret ? { secret } : {})
				});
				if (!saved) return;
				// The slug is the server's answer, not the form's: renaming can land on
				// a name already taken and come back suffixed, and the card has to show
				// what the tools are actually called.
				servers = servers.map((entry) => (entry.id === saved.id ? saved : entry));
				if (secret) secrets = { ...secrets, [server.id]: '' };
			} catch {
				// Said already.
			}
		}, 500);
	}

	/** Test one, and hand the answer back to the card that asked. */
	async function test(server: McpServerView): Promise<Verdict> {
		try {
			const typed = secrets[server.id];
			const verdict = await api<Verdict>('/api/mcp/verify', 'POST', {
				id: server.id,
				url: server.url,
				...(typed ? { secret: typed } : {})
			});
			return verdict ?? { ok: false };
		} catch {
			// `api()` has already said what went wrong; the card still needs an answer.
			return { ok: false };
		}
	}

	async function create() {
		if (!draft.url.trim()) return;
		creating = true;
		try {
			// Tested before it is stored, like a connection and like a bot: nobody
			// should have to save a wrong address to find out it is wrong.
			const verdict = await api<Verdict>('/api/mcp/verify', 'POST', {
				url: draft.url,
				...(draft.secret ? { secret: draft.secret } : {})
			});
			if (!verdict?.ok) {
				toast.error($LL.connectionFailed(), { description: verdict?.error });
				return;
			}

			const created = await api<McpServerView>('/api/mcp', 'POST', {
				label: draft.label.trim() || new URL(draft.url).hostname,
				url: draft.url,
				secret: draft.secret || null,
				enabled: true
			});
			if (created) {
				servers = [...servers, created];
				verdicts = { ...verdicts, [created.id]: verdict };
				justAddedId = created.id;
			}
			adding = false;
			draft = { label: '', url: '', secret: '' };
			toast.success($LL.mcpConnected({ count: verdict.total ?? 0 }));
		} catch {
			// Said already.
		} finally {
			creating = false;
		}
	}

	async function remove(id: string) {
		await api(`/api/mcp/${id}`, 'DELETE');
		servers = servers.filter((entry) => entry.id !== id);
	}
</script>

<SettingsSection title={$LL.mcpServers()} description={$LL.mcpServersDescription()}>
	{#snippet badge()}
		{#if !loading && !canManage}
			<SettingsBadge>{$LL.sharedByAdminBadge()}</SettingsBadge>
		{/if}
	{/snippet}

	{#if loading}
		<Skeleton />
	{:else if !canManage && !servers.length}
		<!-- Stated rather than hidden, like a locked web-fetch: a feature that is
		     simply absent reads as one that does not exist. -->
		<SettingsHint>{$LL.mcpNotAllowed()}</SettingsHint>
	{:else}
		{#if !servers.length}
			<div class="border-shade-3 rounded-xl border">
				<EmptyMessage>{$LL.noMcpServers()}</EmptyMessage>
			</div>
		{/if}

		<!-- Off by default, unlike the web toggles: sending the catalogues is what
		     makes a call possible at all, so a conversation that has not asked for
		     them cannot produce one. Reaching for the switch when there is something
		     to do with it is cheaper and narrower than leaving it open all day. -->
		<FieldCheckbox label={$LL.mcpByDefault()} bind:checked={$settingsStore.mcpByDefault} />
		<SettingsHint>{$LL.mcpByDefaultHint()}</SettingsHint>

		<!-- One number for every server together, because what costs is the size of a
		     request and a request carries the lot. Above the list rather than on each
		     card, where it would read as a per-server share it is not. -->
		<SettingsField label={$LL.mcpMaxTools()} hint={$LL.mcpMaxToolsHint()}>
			<SettingsSlider
				label={$LL.mcpMaxTools()}
				min={MCP_LIMITS.minTools}
				max={MCP_LIMITS.maxTools}
				step={10}
				bind:value={$settingsStore.mcpMaxTools}
			/>
		</SettingsField>
		{#if ($settingsStore.mcpMaxTools ?? MCP_LIMITS.defaultTools) > MCP_LIMITS.warnAboveTools}
			<!-- Said where the number is set, not in the documentation. Not a refusal:
			     a catalogue that size is a legitimate thing to want, and it is also
			     paid for on every round of every turn. -->
			<p class="text-negative text-xs leading-snug">
				{$LL.mcpMaxToolsWarning({ count: $settingsStore.mcpMaxTools ?? MCP_LIMITS.defaultTools })}
			</p>
		{/if}

		{#each servers as server, index (server.id)}
			<McpServer
				bind:server={servers[index]}
				initialVerdict={verdicts[server.id] ?? null}
				secret={secrets[server.id] ?? ''}
				startOpen={server.id === justAddedId}
				onChange={() => persist(servers[index])}
				onSecret={(value) => (secrets = { ...secrets, [server.id]: value })}
				onDelete={() => remove(server.id)}
				onVerify={() => test(server)}
			/>
		{/each}

		{#if canManage}
			{#if servers.length >= limit}
				<SettingsHint>{$LL.mcpLimitReached({ count: limit })}</SettingsHint>
			{:else if !adding}
				<button
					type="button"
					onclick={() => (adding = true)}
					class="border-shade-4 text-muted hover:border-accent hover:text-active flex items-center justify-center gap-2 rounded-xl border border-dashed p-4 text-sm transition-colors"
				>
					<Plus class="base-icon" />
					{$LL.addMcpServer()}
				</button>
			{:else}
				<div class="border-shade-4 flex flex-col gap-3 rounded-xl border border-dashed p-4">
					<SettingsField label={$LL.label()}>
						<input class="settings-field" bind:value={draft.label} placeholder="MCP" />
					</SettingsField>
					<SettingsField label={$LL.mcpServerUrl()} hint={$LL.mcpServerUrlHint()}>
						<input
							class="settings-field font-mono text-xs"
							bind:value={draft.url}
							placeholder="https://mcp.example.com/mcp"
							spellcheck="false"
						/>
					</SettingsField>
					<SettingsField label={$LL.mcpToken()} hint={$LL.mcpTokenHint()}>
						<input
							class="settings-field font-mono text-xs"
							type="password"
							autocomplete="off"
							bind:value={draft.secret}
						/>
					</SettingsField>

					<div class="border-shade-3 flex items-center gap-2 border-t pt-3">
						<Button class="flex-1" onclick={create} disabled={creating || !draft.url.trim()}>
							{#if creating}
								<LoaderCircle class="base-icon animate-spin" />
								{$LL.connecting()}
							{:else}
								<Check class="base-icon" />
								{$LL.connect()}
							{/if}
						</Button>
						<Button variant="outline" onclick={() => (adding = false)}>{$LL.cancel()}</Button>
					</div>
				</div>
			{/if}
		{/if}
	{/if}
</SettingsSection>
