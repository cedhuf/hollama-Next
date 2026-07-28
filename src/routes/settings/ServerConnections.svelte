<script lang="ts">
	import { Check, LoaderCircle } from '@lucide/svelte';
	import { onMount } from 'svelte';
	import { toast } from 'svelte-sonner';

	import Button from '$lib/components/Button.svelte';
	import EmptyMessage from '$lib/components/EmptyMessage.svelte';
	import P from '$lib/components/P.svelte';
	import { ConnectionType, getDefaultServer, PROVIDERS, type Server } from '$lib/connections';
	import { settingsStore } from '$lib/localStorage';
	import { fetchProviders, providerModels } from '$lib/providers';
	import { currentUser } from '$lib/stores/auth';

	import Connection from './Connection.svelte';

	// Server-mode connections. Admins manage shared SYSTEM servers; users their
	// own PERSONAL servers (when enabled). Saved servers use the full Connection
	// UI (verify, Ollama pull, model filter, advanced, enable, delete) — same as
	// local mode — just persisted via the API. New servers are added through a
	// Verify → Save card.

	interface ApiServer {
		id: string;
		connectionType: string;
		baseUrl?: string;
		label: string | null;
		modelFilter?: string | null;
		isEnabled: boolean;
		verifiedAt?: string | null;
		color?: string | null;
		scope?: string;
	}

	const input =
		'w-full rounded-md border border-shade-3 bg-shade-0 px-2.5 py-1.5 text-sm outline-none focus:border-accent';

	let allowUserKeys = $state(false);
	let servers = $state<Server[]>([]);

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
	let justAddedId = $state<string | null>(null);

	function toServer(v: ApiServer): Server {
		return {
			id: v.id,
			connectionType: v.connectionType as ConnectionType,
			baseUrl: v.baseUrl ?? '',
			label: v.label ?? undefined,
			modelFilter: v.modelFilter ?? undefined,
			isEnabled: v.isEnabled,
			// Restored from the server, so the badge survives a reload.
			isVerified: v.verifiedAt ? new Date(v.verifiedAt) : null,
			color: v.color ?? undefined,
			apiKey: '' // never returned; type in the field to set/replace
		};
	}

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
		const list: ApiServer[] = isAdmin
			? await fetch('/api/admin/servers').then((r) => r.json())
			: providers.servers.filter((s: ApiServer) => s.scope === 'personal');
		servers = list.map(toServer);
	}

	/**
	 * Refresh the shared model catalogue after a connection syncs. `/api/providers`
	 * is cached for the session, so a successful sync is the moment to force it.
	 */
	async function refreshCatalogue() {
		const { servers: providers } = await fetchProviders(true);
		$settingsStore.models = providerModels(providers).sort((a, b) =>
			a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
		);
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

	const touch = () => (verified = false);

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
				toast.error('Connection failed', { description: result?.error });
			}
		} finally {
			verifying = false;
		}
	}

	async function saveDraft() {
		const created = await api<{ id: string }>(base, 'POST', {
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
		justAddedId = created?.id ?? null;
		toast.success('Server added');
	}

	// Debounced PUT per server; the key is sent only when (re)typed.
	const timers: Record<string, ReturnType<typeof setTimeout>> = {};
	function persist(server: Server) {
		clearTimeout(timers[server.id]);
		timers[server.id] = setTimeout(() => {
			void fetch(`${base}/${server.id}`, {
				method: 'PUT',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					baseUrl: server.baseUrl,
					label: server.label ?? null,
					modelFilter: server.modelFilter ?? null,
					isEnabled: server.isEnabled,
					verifiedAt:
						server.isVerified instanceof Date
							? server.isVerified.toISOString()
							: (server.isVerified ?? null),
					color: server.color ?? null,
					...(server.apiKey ? { apiKey: server.apiKey } : {})
				})
			});
		}, 500);
	}

	async function removeServer(id: string) {
		await api(`${base}/${id}`, 'DELETE');
		servers = servers.filter((s) => s.id !== id);
	}
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
		{#each servers as server (server.id)}
			<Connection
				{server}
				startEditing={server.id === justAddedId}
				onChange={() => persist(server)}
				onDelete={() => removeServer(server.id)}
				onSynced={refreshCatalogue}
			/>
		{/each}

		<!-- Add a server: Verify, then Save -->
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
					<Button onclick={verifyDraft} disabled={verifying || !draft.baseUrl}>
						{#if verifying}
							<LoaderCircle class="base-icon animate-spin" /> Verifying…
						{:else}
							Verify
						{/if}
					</Button>
				{:else}
					<Button onclick={saveDraft}><Check class="base-icon" /> Save</Button>
					<span class="text-xs text-muted">{modelCount} models found</span>
				{/if}
			</div>
		</div>
	{/if}
</div>
