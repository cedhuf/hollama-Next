<script lang="ts">
	import { Check, LoaderCircle, Plus, TriangleAlert } from '@lucide/svelte';
	import { onMount } from 'svelte';

	import LL from '$i18n/i18n-svelte';
	import Button from '$lib/components/Button.svelte';
	import EmptyMessage from '$lib/components/EmptyMessage.svelte';
	import FieldCheckbox from '$lib/components/FieldCheckbox.svelte';
	import Skeleton from '$lib/components/Skeleton.svelte';
	import { settingsStore } from '$lib/localStorage';
	import { MCP_LIMITS, type McpServerView } from '$lib/mcp';
	import { toast } from '$lib/toast';

	import McpServer from './McpServer.svelte';
	import SettingsBadge from './SettingsBadge.svelte';
	import SettingsField from './SettingsField.svelte';
	import SettingsHint from './SettingsHint.svelte';
	import SettingsSection from './SettingsSection.svelte';
	import SettingsSlider from './SettingsSlider.svelte';

	/** A list of cards and a folded form to add one, like the bots and connections tabs: it is the same shape of thing. What differs is that testing one answers a question worth showing. */

	let servers = $state<McpServerView[]>([]);
	let loading = $state(true);
	let canManage = $state(false);
	let limit = $state<number>(MCP_LIMITS.perUser);

	/** Tokens typed but not yet stored, by server id. Never filled from the server. */
	let secrets = $state<Record<string, string>>({});
	/** The one just added, opened so its settings are where the eye already is. */
	let justAddedId = $state<string | null>(null);
	let adding = $state(false);
	let creating = $state(false);
	let draft = $state({ label: '', url: '', secret: '' });

	/** What `/api/mcp/verify` answers for a server that does not exist yet. */
	type Verdict = { ok: boolean; tools?: string[]; total?: number; error?: string };

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

	const ceiling = $derived($settingsStore.mcpMaxTools ?? MCP_LIMITS.defaultTools);

	/** Ask one server what it offers now. The card shows the answer, whichever it is. */
	async function refresh(id: string) {
		try {
			const answer = await api<{ ok: boolean; server?: McpServerView; error?: string }>(
				`/api/mcp/${id}/tools`,
				'POST'
			);
			if (answer?.ok && answer.server) {
				servers = servers.map((entry) => (entry.id === id ? answer.server! : entry));
			}
			return answer ?? { ok: false };
		} catch {
			// `api()` has already said what went wrong; the card still needs an answer.
			return { ok: false };
		}
	}

	async function load() {
		try {
			const config = await api<{ canManage: boolean; limit: number }>('/api/mcp/config', 'GET');
			canManage = config?.canManage ?? false;
			limit = config?.limit ?? MCP_LIMITS.perUser;

			servers = (await api<McpServerView[]>('/api/mcp', 'GET')) ?? [];
		} catch {
			// `api()` has already said what went wrong. An empty list is the honest thing
			// to show when the instance would not answer.
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
					disabledGroups: server.disabledGroups,
					// Omitted keeps the stored one. Sent only when somebody typed.
					...(secret ? { secret } : {})
				});
				if (!saved) return;
				// The slug is the server's answer, not the form's: renaming can land on a name
				// already taken and come back suffixed.
				servers = servers.map((entry) => (entry.id === saved.id ? saved : entry));
				if (secret) secrets = { ...secrets, [server.id]: '' };
			} catch {
				// Said already.
			}
		}, 500);
	}

	async function create() {
		if (!draft.url.trim()) return;
		creating = true;
		try {
			// Tested before it is stored, like a connection and like a bot: nobody should
			// have to save a wrong address to find out it is wrong.
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
		<!-- Stated rather than hidden, like a locked web-fetch: a feature that is simply
		     absent reads as one that does not exist. -->
		<SettingsHint>{$LL.mcpNotAllowed()}</SettingsHint>
	{:else}
		{#if !servers.length}
			<div class="border-shade-3 rounded-xl border">
				<EmptyMessage>{$LL.noMcpServers()}</EmptyMessage>
			</div>
		{/if}

		<!-- Off by default, unlike the web toggles: sending the catalogues is what makes
		     a call possible, so a conversation that has not asked cannot produce one. -->
		<FieldCheckbox label={$LL.mcpByDefault()} bind:checked={$settingsStore.mcpByDefault} />

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

		<!-- Experimental, and the badge is not decoration: it trades a smaller request
		     against an extra round and a missed prompt cache, and which wins depends on
		     the catalogue, the habits and the provider's prices. -->
		<FieldCheckbox label={$LL.mcpProgressive()} bind:checked={$settingsStore.mcpProgressive}>
			{#snippet badge()}
				<SettingsBadge>{$LL.experimental()}</SettingsBadge>
			{/snippet}
		</FieldCheckbox>
		<SettingsHint>{$LL.mcpProgressiveHint()}</SettingsHint>

		<!-- The same warning box the Users tab uses, rather than a red sentence under
		     the field. Not a refusal either, hence the warning colour: a catalogue this
		     size is legitimate, and it is also paid for on every round of every turn. -->
		{#if ceiling > MCP_LIMITS.warnAboveTools}
			<div class="border-warning/40 bg-warning/10 flex flex-col gap-1 rounded-lg border p-3">
				<span class="text-active flex items-center gap-1.5 text-sm font-medium">
					<TriangleAlert class="h-4 w-4 shrink-0" />
					{$LL.mcpMaxToolsWarningTitle()}
				</span>
				<p class="text-muted text-xs leading-relaxed">
					{$LL.mcpMaxToolsWarning({ count: ceiling })}
				</p>
			</div>
		{/if}

		{#each servers as server, index (server.id)}
			<McpServer
				bind:server={servers[index]}
				secret={secrets[server.id] ?? ''}
				startOpen={server.id === justAddedId}
				onChange={() => persist(servers[index])}
				onSecret={(value) => (secrets = { ...secrets, [server.id]: value })}
				onDelete={() => remove(server.id)}
				onRefresh={() => refresh(server.id)}
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
