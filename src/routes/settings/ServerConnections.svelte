<script lang="ts">
	import { Check, LoaderCircle } from '@lucide/svelte';
	import { onMount } from 'svelte';
	import { toast } from 'svelte-sonner';

	import LL from '$i18n/i18n-svelte';
	import Button from '$lib/components/Button.svelte';
	import EmptyMessage from '$lib/components/EmptyMessage.svelte';
	import Skeleton from '$lib/components/Skeleton.svelte';
	import {
		ConnectionType,
		getDefaultServer,
		getProvider,
		infomaniakBaseUrl,
		infomaniakProductId,
		PROVIDERS,
		type Server
	} from '$lib/connections';
	import { serversStore, settingsStore } from '$lib/localStorage';
	import { fetchProviders, providerModels, providerToServer } from '$lib/providers';
	import { currentUser } from '$lib/stores/auth';

	import Connection from './Connection.svelte';
	import ModelNames from './ModelNames.svelte';
	import SettingsField from './SettingsField.svelte';
	import SettingsPanel from './SettingsPanel.svelte';
	import SettingsSection from './SettingsSection.svelte';

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
		modelLabels?: Record<string, string>;
		modelPricing?: Record<string, { input?: number; output?: number; currency?: string }>;
		sharedModels?: string[];
		/** A stored key is never returned; this is all the browser gets to know. */
		hasApiKey?: boolean;
		scope?: string;
	}

	let allowUserKeys = $state(false);
	let servers = $state<Server[]>([]);
	/**
	 * True until the first `load()` settles. Without it the tab renders its
	 * "no permission" / empty state from the default values and then swaps it for
	 * the real one — a wrong answer shown confidently for as long as the request takes.
	 */
	let loading = $state(true);
	/** Which connections already hold a key, keyed by id (see `ApiServer.hasApiKey`). */
	let storedKeys = $state<Record<string, boolean>>({});

	const isAdmin = $derived($currentUser?.role === 'admin');
	const base = $derived(isAdmin ? '/api/admin/servers' : '/api/servers');
	const canManage = $derived(isAdmin || allowUserKeys);

	let draft = $state({
		connectionType: ConnectionType.Ollama as string,
		baseUrl: '',
		label: '',
		apiKey: '',
		modelFilter: '' as string | null,
		color: ''
	});
	/** Drives the placeholders of the "add a server" form. */
	const draftProvider = $derived(getProvider(draft.connectionType as ConnectionType));

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
			modelLabels: v.modelLabels ?? undefined,
			modelPricing: v.modelPricing ?? undefined,
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
			toast.error($LL.requestFailed(), { description: `HTTP ${response.status}` });
			throw new Error(`HTTP ${response.status}`);
		}
		return response.status === 204 ? null : ((await response.json()) as T);
	}

	/**
	 * `force` re-fetches after a mutation; otherwise the session-wide
	 * `/api/providers` cache answers, which is usually already warm — the sessions
	 * layout fills it at boot to build the model list.
	 */
	async function load(force = false) {
		try {
			// Admins never need `/api/providers` here: `allowUserKeys` only feeds
			// `canManage`, which they satisfy on their own. Skipping it halves the
			// round-trips on the tab they open most.
			const list: ApiServer[] = isAdmin
				? await fetch('/api/admin/servers').then((r) => r.json())
				: await fetchProviders(force).then(({ servers: all, allowUserKeys: allowed }) => {
						allowUserKeys = allowed;
						return all.filter((provider) => provider.scope === 'personal') as ApiServer[];
					});
			servers = list.map(toServer);
			storedKeys = Object.fromEntries(list.map((v) => [v.id, !!v.hasApiKey]));
			sharedByServer = Object.fromEntries(list.map((v) => [v.id, v.sharedModels ?? []]));
		} finally {
			loading = false;
		}
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
		// The model dropdowns read colours and display names off `serversStore`,
		// which is otherwise only filled at boot — refresh it too, or the change
		// stays invisible until a reload.
		serversStore.setQuiet(providers.map(providerToServer));
	}

	onMount(load);

	function selectPreset(type: ConnectionType) {
		const preset = getDefaultServer(
			type,
			servers.map((s) => s.color)
		);
		draft = {
			connectionType: type,
			baseUrl: preset.baseUrl,
			label: '',
			apiKey: '',
			modelFilter: preset.modelFilter ?? '',
			color: preset.color ?? ''
		};
		verified = false;
	}

	const touch = () => (verified = false);

	async function verifyDraft() {
		if (!draft.baseUrl) return toast.error($LL.baseUrlRequired());
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
				toast.success($LL.connectionVerifiedWithModels({ count: modelCount }));
			} else {
				toast.error($LL.connectionFailed(), { description: result?.error });
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
			color: draft.color || null,
			isEnabled: true
		});
		draft = {
			connectionType: ConnectionType.Ollama,
			baseUrl: '',
			label: '',
			apiKey: '',
			modelFilter: '',
			color: ''
		};
		verified = false;
		await load(true);
		justAddedId = created?.id ?? null;
		toast.success($LL.serverAdded());
	}

	// Debounced PUT per server; the key is sent only when (re)typed.
	const timers: Record<string, ReturnType<typeof setTimeout>> = {};
	function persist(server: Server, afterSave?: () => void) {
		// Typing a key means one is now stored, even though the API won't echo it back.
		if (server.apiKey) storedKeys[server.id] = true;
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
					modelLabels: server.modelLabels ?? {},
					modelPricing: server.modelPricing ?? {},
					...(server.apiKey ? { apiKey: server.apiKey } : {})
				})
			}).then(() => afterSave?.());
		}, 500);
	}

	/** When set, the tab shows the model-name editor for that connection instead. */
	let renamingId = $state<string | null>(null);
	const renaming = $derived(servers.find((s) => s.id === renamingId));
	/**
	 * Which of this connection's models the instance offers its users.
	 *
	 * Kept beside the connections rather than on them: it is the admin's curation
	 * and not part of what a connection is. The pricing view needs it because an
	 * unpriced model only matters when somebody else can reach it.
	 */
	let sharedByServer = $state<Record<string, string[]>>({});
	const sharedHere = $derived(renamingId ? (sharedByServer[renamingId] ?? []) : []);

	async function removeServer(id: string) {
		await api(`${base}/${id}`, 'DELETE');
		servers = servers.filter((s) => s.id !== id);
	}
</script>

{#if renaming}
	<ModelNames
		server={renaming}
		shared={sharedHere}
		onBack={() => (renamingId = null)}
		onChange={() => persist(renaming, refreshCatalogue)}
	/>
{:else}
	<SettingsPanel>
		<SettingsSection title={isAdmin ? $LL.systemServers() : $LL.yourServers()}>
			{#if loading}
				<!-- Placeholders rather than an empty section: the list keeps its shape
				     and nothing claims to be the final answer. `Skeleton` stays invisible
				     unless the wait actually drags, so a warm cache shows nothing at all. -->
				<Skeleton />
			{:else if !canManage}
				<div class="rounded-xl border border-shade-3">
					<EmptyMessage>{$LL.providersManagedByAdmin()}</EmptyMessage>
				</div>
			{:else}
				{#each servers as server (server.id)}
					<Connection
						{server}
						startEditing={server.id === justAddedId}
						hasApiKey={storedKeys[server.id]}
						onChange={() => persist(server)}
						onDelete={() => removeServer(server.id)}
						onSynced={refreshCatalogue}
						onRenameModels={() => (renamingId = server.id)}
					/>
				{/each}
			{/if}
		</SettingsSection>

		{#if canManage && !loading}
			<!-- Add a server: pick a provider, Verify, then Save. Dashed border so it
			     reads as a slot to fill rather than another connection. -->
			<SettingsSection title={$LL.addAServer()}>
				<div class="flex flex-col gap-3 rounded-xl border border-dashed border-shade-4 p-4">
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

					<div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
						<!-- Same rule as an existing connection: Infomaniak's endpoint is a
						     function of its product ID, so that is what is asked for. Leaving
						     it empty leaves the URL empty, and Verify stays disabled. -->
						{#if draft.connectionType === ConnectionType.Infomaniak}
							<SettingsField label={$LL.productId()}>
								<input
									class="settings-field font-mono text-xs"
									value={infomaniakProductId(draft.baseUrl)}
									placeholder="123456"
									oninput={(e) => {
										draft.baseUrl = infomaniakBaseUrl(e.currentTarget.value);
										touch();
									}}
								/>
							</SettingsField>
						{:else}
							<SettingsField label={$LL.baseUrl()}>
								<input
									class="settings-field font-mono text-xs"
									bind:value={draft.baseUrl}
									oninput={touch}
									placeholder={draftProvider.baseUrl}
								/>
							</SettingsField>
						{/if}

						<SettingsField label={$LL.apiKey()}>
							<input
								class="settings-field"
								type="password"
								autocomplete="off"
								bind:value={draft.apiKey}
								oninput={touch}
								placeholder={draftProvider.requiresApiKey ? 'sk-…' : $LL.optional()}
							/>
						</SettingsField>

						<SettingsField label={$LL.label()}>
							<input
								class="settings-field"
								bind:value={draft.label}
								oninput={touch}
								placeholder={draftProvider.name}
							/>
						</SettingsField>
					</div>

					<div class="flex items-center gap-2">
						{#if !verified}
							<Button onclick={verifyDraft} disabled={verifying || !draft.baseUrl}>
								{#if verifying}
									<LoaderCircle class="base-icon animate-spin" />
									{$LL.verifying()}
								{:else}
									{$LL.verify()}
								{/if}
							</Button>
						{:else}
							<Button onclick={saveDraft}><Check class="base-icon" /> {$LL.save()}</Button>
							<span class="text-xs text-muted">{$LL.modelsFound({ count: modelCount })}</span>
						{/if}
					</div>
				</div>
			</SettingsSection>
		{/if}
	</SettingsPanel>
{/if}
