<script lang="ts">
	import { Check, LoaderCircle, Trash2 } from '@lucide/svelte';
	import { onMount } from 'svelte';
	import { toast } from 'svelte-sonner';

	import Button from '$lib/components/Button.svelte';
	import EmptyMessage from '$lib/components/EmptyMessage.svelte';
	import P from '$lib/components/P.svelte';
	import { ConnectionType, getDefaultServer, PROVIDERS } from '$lib/connections';
	import { currentUser } from '$lib/stores/auth';

	// Server-mode connections. Admins manage shared SYSTEM servers; users their
	// own PERSONAL servers (when enabled). Add flow: fill in → Verify → Save.
	// Saved servers land in the list enabled, and can be toggled off anytime.

	interface SavedServer {
		id: string;
		connectionType: string;
		baseUrl: string;
		label: string | null;
		modelFilter?: string | null;
		isEnabled: boolean;
		hasApiKey?: boolean;
	}

	const BADGE: Record<string, { id: string; color: string }> = {
		[ConnectionType.Ollama]: { id: 'ollama', color: '#1D9E75' },
		[ConnectionType.OpenAI]: { id: 'openai', color: '#378ADD' },
		[ConnectionType.Anthropic]: { id: 'claude', color: '#D85A30' },
		[ConnectionType.Infomaniak]: { id: 'infomaniak', color: '#BA7517' },
		[ConnectionType.OpenAICompatible]: { id: 'compatible', color: '#888780' }
	};
	const input =
		'w-full rounded-md border border-shade-3 bg-shade-0 px-2.5 py-1.5 text-sm outline-none focus:border-accent';

	let allowUserKeys = $state(false);
	let servers = $state<SavedServer[]>([]);

	const isAdmin = $derived($currentUser?.role === 'admin');
	const base = $derived(isAdmin ? '/api/admin/servers' : '/api/servers');
	const canManage = $derived(isAdmin || allowUserKeys);

	let draft = $state({
		connectionType: ConnectionType.Ollama as string,
		baseUrl: '',
		label: '',
		apiKey: '',
		modelFilter: '' as string | null
	});
	let verifying = $state(false);
	let verified = $state(false);
	let modelCount = $state(0);

	async function api<T>(url: string, method: string, body?: unknown): Promise<T | null> {
		const response = await fetch(url, {
			method,
			headers: body ? { 'content-type': 'application/json' } : {},
			body: body ? JSON.stringify(body) : undefined
		});
		if (!response.ok) {
			toast.error('Request failed', { description: `HTTP ${response.status}` });
			throw new Error(`HTTP ${response.status}`);
		}
		return response.status === 204 ? null : ((await response.json()) as T);
	}

	async function load() {
		const providers = await fetch('/api/providers').then((r) => r.json());
		allowUserKeys = providers.allowUserKeys;
		servers = isAdmin
			? await fetch('/api/admin/servers').then((r) => r.json())
			: providers.servers.filter((s: { scope: string }) => s.scope === 'personal');
	}

	onMount(load);

	function selectPreset(type: ConnectionType) {
		const preset = getDefaultServer(type);
		draft = {
			connectionType: type,
			baseUrl: preset.baseUrl,
			label: PROVIDERS.find((p) => p.type === type)?.name ?? '',
			apiKey: '',
			modelFilter: preset.modelFilter ?? ''
		};
		verified = false;
	}

	function touch() {
		verified = false;
	}

	async function verifyDraft() {
		if (!draft.baseUrl) return toast.error('Base URL is required');
		verifying = true;
		try {
			const result = await api<{ ok: boolean; models?: string[]; error?: string }>(
				'/api/servers/verify',
				'POST',
				{
					connectionType: draft.connectionType,
					baseUrl: draft.baseUrl,
					apiKey: draft.apiKey || null,
					modelFilter: draft.modelFilter || null
				}
			);
			if (result?.ok) {
				verified = true;
				modelCount = result.models?.length ?? 0;
				toast.success(`Connection verified — ${modelCount} model${modelCount === 1 ? '' : 's'}`);
			} else {
				verified = false;
				toast.error('Connection failed', { description: result?.error });
			}
		} finally {
			verifying = false;
		}
	}

	async function saveDraft() {
		await api(base, 'POST', {
			connectionType: draft.connectionType,
			baseUrl: draft.baseUrl,
			label: draft.label || null,
			modelFilter: draft.modelFilter || null,
			apiKey: draft.apiKey || null,
			isEnabled: true
		});
		draft = {
			connectionType: ConnectionType.Ollama,
			baseUrl: '',
			label: '',
			apiKey: '',
			modelFilter: ''
		};
		verified = false;
		await load();
		toast.success('Server added');
	}

	async function toggleEnabled(server: SavedServer) {
		const next = !server.isEnabled;
		server.isEnabled = next;
		await api(`${base}/${server.id}`, 'PUT', { isEnabled: next });
	}

	async function removeServer(id: string) {
		if (!confirm('Delete this server?')) return;
		await api(`${base}/${id}`, 'DELETE');
		await load();
	}

	const badgeOf = (type: string) => BADGE[type] ?? { id: '', color: '#888780' };
</script>

<div class="flex flex-col gap-4">
	<div class="flex flex-col gap-1">
		<P><strong>{isAdmin ? 'System servers' : 'Your servers'}</strong></P>
		<span class="text-xs text-muted">
			{isAdmin
				? 'Shared with everyone — pick which models to expose in the Admin tab. Keys are encrypted and never sent to the browser.'
				: 'Your own provider connections, private to your account.'}
		</span>
	</div>

	{#if !canManage}
		<div class="rounded-md border border-shade-3">
			<EmptyMessage>Providers are managed by your administrator.</EmptyMessage>
		</div>
	{:else}
		<!-- Saved servers -->
		{#each servers as server (server.id)}
			<div class="flex items-center gap-3 rounded-md border border-shade-3 p-3">
				<button
					type="button"
					role="switch"
					aria-checked={server.isEnabled}
					aria-label="Enabled"
					onclick={() => toggleEnabled(server)}
					class="relative h-5 w-9 shrink-0 rounded-full transition-colors {server.isEnabled
						? 'bg-accent'
						: 'bg-shade-3'}"
				>
					<span
						class="absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all {server.isEnabled
							? 'left-[18px]'
							: 'left-0.5'}"
					></span>
				</button>
				<div class="flex min-w-0 flex-1 flex-col">
					<span class="truncate text-sm font-medium">{server.label || server.connectionType}</span>
					<span class="truncate text-xs text-muted">{server.baseUrl}</span>
				</div>
				<span
					class="shrink-0 rounded-full border px-2 py-0.5 text-[11px]"
					style="border-color: {badgeOf(server.connectionType).color}; color: {badgeOf(
						server.connectionType
					).color}"
				>
					{badgeOf(server.connectionType).id}
				</span>
				<Button variant="icon" on:click={() => removeServer(server.id)} aria-label="Delete">
					<Trash2 class="base-icon" />
				</Button>
			</div>
		{/each}

		<!-- Add a server -->
		<div class="flex flex-col gap-2 rounded-md border border-dashed border-shade-4 p-3">
			<span class="text-sm font-medium">Add a server</span>
			<div class="flex flex-wrap gap-1.5">
				{#each PROVIDERS as provider (provider.type)}
					<button
						type="button"
						onclick={() => selectPreset(provider.type)}
						class="rounded-md border px-2.5 py-1 text-xs transition-colors hover:border-shade-6 {draft.connectionType ===
						provider.type
							? 'border-accent text-active'
							: 'border-shade-4 text-muted'}"
					>
						{provider.name}
					</button>
				{/each}
			</div>
			<input
				class={input}
				bind:value={draft.label}
				oninput={touch}
				placeholder="Label (optional)"
			/>
			<input class={input} bind:value={draft.baseUrl} oninput={touch} placeholder="Base URL" />
			<input
				class={input}
				type="password"
				bind:value={draft.apiKey}
				oninput={touch}
				placeholder="API key (optional)"
			/>

			<div class="flex items-center gap-2">
				{#if !verified}
					<Button on:click={verifyDraft} disabled={verifying || !draft.baseUrl}>
						{#if verifying}
							<LoaderCircle class="base-icon animate-spin" /> Verifying…
						{:else}
							Verify
						{/if}
					</Button>
				{:else}
					<Button on:click={saveDraft}>
						<Check class="base-icon" /> Save
					</Button>
					<span class="text-xs text-muted">{modelCount} models found</span>
				{/if}
			</div>
		</div>
	{/if}
</div>
