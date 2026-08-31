<script lang="ts">
	import { Check, LoaderCircle, Plug, Plus } from '@lucide/svelte';
	import { onMount } from 'svelte';

	import LL from '$i18n/i18n-svelte';
	import Button from '$lib/components/Button.svelte';
	import ButtonConfirm from '$lib/components/ButtonConfirm.svelte';
	import EmptyMessage from '$lib/components/EmptyMessage.svelte';
	import FieldCheckbox from '$lib/components/FieldCheckbox.svelte';
	import Skeleton from '$lib/components/Skeleton.svelte';
	import { MCP_LIMITS, type McpServerView } from '$lib/mcp';
	import { toast } from '$lib/toast';

	import SettingsBadge from './SettingsBadge.svelte';
	import SettingsField from './SettingsField.svelte';
	import SettingsHint from './SettingsHint.svelte';
	import SettingsSection from './SettingsSection.svelte';

	/**
	 * The MCP servers this account calls out to.
	 *
	 * A list of cards and a folded form to add one, like the bots tab and the
	 * connections tab, because it is the same shape of thing: an address, a
	 * credential, and a switch. What differs is that testing one answers a
	 * question worth showing, so the tool names come back and stay on the card.
	 */

	type Verdict = { ok: boolean; tools?: string[]; total?: number; cap?: number; error?: string };

	let servers = $state<McpServerView[]>([]);
	let loading = $state(true);
	let canManage = $state(false);
	let isAdmin = $state(false);
	let limit = $state<number>(MCP_LIMITS.perUser);

	/** Everybody's servers, for an administrator. A roster, not a second editor. */
	let all = $state<(McpServerView & { owner: string })[]>([]);

	/** Tokens typed but not yet stored, by server id. Never filled from the server. */
	let secrets = $state<Record<string, string>>({});
	/** The last test's answer, by server id. Cleared when the address changes. */
	let verdicts = $state<Record<string, Verdict>>({});
	let testing = $state<string | null>(null);

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
			const config = await api<{ canManage: boolean; isAdmin: boolean; limit: number }>(
				'/api/mcp/config',
				'GET'
			);
			canManage = config?.canManage ?? false;
			isAdmin = config?.isAdmin ?? false;
			limit = config?.limit ?? MCP_LIMITS.perUser;

			servers = (await api<McpServerView[]>('/api/mcp', 'GET')) ?? [];
			if (isAdmin) await loadAll();
		} catch {
			// `api()` has already said what went wrong. An empty list is the honest
			// thing to show when the instance would not answer.
		} finally {
			loading = false;
		}
	}

	async function loadAll() {
		try {
			const response = await fetch('/api/admin/mcp');
			if (response.ok) all = await response.json();
		} catch {
			// A roster that will not load is not worth an error over the section
			// above it, which works.
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

	async function test(server: McpServerView) {
		testing = server.id;
		try {
			const typed = secrets[server.id];
			const verdict = await api<Verdict>('/api/mcp/verify', 'POST', {
				id: server.id,
				url: server.url,
				...(typed ? { secret: typed } : {})
			});
			verdicts = { ...verdicts, [server.id]: verdict ?? { ok: false } };
		} catch {
			// Said already.
		} finally {
			testing = null;
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
		all = all.filter((entry) => entry.id !== id);
	}

	/**
	 * Suspend somebody's server, or lift the suspension.
	 *
	 * The switch reads as "allowed", so it is on when nothing is blocking it. What
	 * it writes is the instance's decision, never the owner's: their own switch
	 * stays exactly where they left it.
	 */
	async function setAllowed(server: McpServerView, allowed: boolean) {
		await api(`/api/admin/mcp/${server.id}`, 'PUT', { blocked: !allowed });
		await loadAll();
		servers = servers.map((own) => (own.id === server.id ? { ...own, blocked: !allowed } : own));
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

		{#each servers as server, index (server.id)}
			{@const verdict = verdicts[server.id]}
			<div class="border-shade-3 bg-shade-0 flex flex-col gap-3 rounded-xl border p-3">
				<div class="flex items-center gap-2.5">
					<span
						class="bg-shade-2 text-muted flex h-8 w-8 shrink-0 items-center justify-center rounded-md"
						aria-hidden="true"
					>
						<Plug class="base-icon" />
					</span>
					<input
						class="text-active placeholder:text-active hover:border-shade-3 focus:border-shade-3 focus:bg-shade-0 min-w-0 flex-1 rounded-md border border-transparent px-2 py-1 text-sm font-medium outline-none"
						bind:value={servers[index].label}
						oninput={() => persist(servers[index])}
						aria-label={$LL.label()}
					/>
					<ButtonConfirm label={$LL.delete()} onConfirm={() => remove(server.id)} compact />
				</div>

				<SettingsField label={$LL.mcpServerUrl()}>
					<input
						class="settings-field font-mono text-xs"
						bind:value={servers[index].url}
						oninput={() => {
							verdicts = { ...verdicts, [server.id]: undefined as unknown as Verdict };
							persist(servers[index]);
						}}
						placeholder="https://mcp.example.com/mcp"
						spellcheck="false"
					/>
				</SettingsField>

				<SettingsField label={$LL.mcpToken()} hint={$LL.mcpTokenHint()}>
					<input
						class="settings-field font-mono text-xs"
						type="password"
						autocomplete="off"
						value={secrets[server.id] ?? ''}
						oninput={(e) => {
							secrets = { ...secrets, [server.id]: e.currentTarget.value };
							persist(servers[index]);
						}}
						placeholder={server.hasSecret ? '••••••••' : ''}
					/>
				</SettingsField>

				<FieldCheckbox
					label={$LL.mcpEnabled()}
					checked={server.enabled}
					disabled={server.blocked}
					onChange={(value) => {
						servers[index].enabled = value;
						persist(servers[index]);
					}}
				/>

				<!-- What the model will see this server's tools called. Shown because
				     the name is derived, and because a suffixed slug is otherwise a
				     surprise found in a trace. -->
				<SettingsHint>{$LL.mcpToolPrefix({ prefix: `mcp_${server.slug}_` })}</SettingsHint>

				{#if server.blocked}
					<SettingsHint>{$LL.mcpBlockedByAdmin()}</SettingsHint>
				{/if}

				<div class="border-shade-3 flex flex-wrap items-center gap-2 border-t pt-3">
					<Button variant="outline" onclick={() => test(server)} disabled={testing === server.id}>
						{#if testing === server.id}
							<LoaderCircle class="base-icon animate-spin" />
						{/if}
						{$LL.checkConnection()}
					</Button>

					{#if verdict?.ok}
						<span class="text-muted min-w-0 text-xs">
							{$LL.mcpToolsFound({ count: verdict.total ?? 0 })}
						</span>
					{:else if verdict}
						<span class="text-muted min-w-0 truncate text-xs">{verdict.error}</span>
					{/if}
				</div>

				{#if verdict?.ok && verdict.tools?.length}
					<div class="flex flex-wrap gap-1.5">
						{#each verdict.tools as tool (tool)}
							<span
								class="bg-shade-2 text-muted max-w-[15rem] truncate rounded-full px-2 py-0.5 text-xs"
							>
								{tool}
							</span>
						{/each}
					</div>
					{#if verdict.cap}
						<SettingsHint>{$LL.mcpToolsCapped({ count: verdict.cap })}</SettingsHint>
					{/if}
				{/if}
			</div>
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

<!-- An administrator's half: what is running on the instance, and on whose
     account. Two actions, suspend and remove. Never a second editor, because an
     address and a token belong to whoever configured them. -->
{#if !loading && isAdmin && all.length}
	<SettingsSection
		title={$LL.allInstanceMcpServers()}
		description={$LL.allInstanceMcpServersHint()}
	>
		{#each all as server (server.id)}
			<div class="border-shade-3 bg-shade-0 flex items-center gap-3 rounded-xl border px-3 py-2">
				<span class="min-w-0 flex-1">
					<span class="text-active block truncate text-sm">{server.label}</span>
					<span class="text-muted block truncate text-xs">
						{server.owner} · {server.url}
						{#if !server.enabled}· {$LL.offByItsOwner()}{/if}
					</span>
				</span>

				<label class="flex shrink-0 cursor-pointer items-center" title={$LL.mcpAllowed()}>
					<input
						type="checkbox"
						class="peer sr-only"
						checked={!server.blocked}
						onchange={(e) => setAllowed(server, e.currentTarget.checked)}
					/>
					<span
						class="bg-shade-3 peer-checked:bg-accent peer-focus-visible:ring-accent relative h-5 w-9 rounded-full transition-colors peer-focus-visible:ring-2 after:absolute after:top-0.5 after:left-0.5 after:h-4 after:w-4 after:rounded-full after:bg-white after:transition-transform peer-checked:after:translate-x-4"
					></span>
				</label>

				<ButtonConfirm label={$LL.delete()} onConfirm={() => remove(server.id)} compact />
			</div>
		{/each}
	</SettingsSection>
{/if}
