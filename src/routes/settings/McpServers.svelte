<script lang="ts">
	import { Check, LoaderCircle, Plus } from '@lucide/svelte';
	import { onMount } from 'svelte';

	import LL from '$i18n/i18n-svelte';
	import Button from '$lib/components/Button.svelte';
	import ButtonConfirm from '$lib/components/ButtonConfirm.svelte';
	import EmptyMessage from '$lib/components/EmptyMessage.svelte';
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
	let isAdmin = $state(false);
	let limit = $state<number>(MCP_LIMITS.perUser);

	/** Everybody's servers, for an administrator. A roster, not a second editor. */
	let all = $state<(McpServerView & { owner: string })[]>([]);

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
