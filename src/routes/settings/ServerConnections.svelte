<script lang="ts">
	import { Check, LoaderCircle, Plus } from '@lucide/svelte';
	import { onMount } from 'svelte';

	import LL from '$i18n/i18n-svelte';
	import type { LoadOptions } from '$lib/chat/options';
	import Button from '$lib/components/Button.svelte';
	import EmptyMessage from '$lib/components/EmptyMessage.svelte';
	import Skeleton from '$lib/components/Skeleton.svelte';
	import {
		ConnectionType,
		getDefaultServer,
		getProvider,
		type ModelKind,
		type ModelPrice,
		type Server
	} from '$lib/connections';
	import { serversStore, settingsStore } from '$lib/localStorage';
	import { fetchProviders, providerModels, providerToServer } from '$lib/providerCatalogue';
	import { describeProvider } from '$lib/providers';
	import { currentUser } from '$lib/stores/auth';
	import { toast } from '$lib/toast';

	import Connection from './Connection.svelte';
	import ModelNames from './ModelNames.svelte';
	import ProviderPicker from './ProviderPicker.svelte';
	import SettingsField from './SettingsField.svelte';
	import SettingsPanel from './SettingsPanel.svelte';
	import SettingsSection from './SettingsSection.svelte';

	// Admins manage shared SYSTEM servers; users their own PERSONAL servers (when
	// enabled). Saved servers use the full Connection UI (verify, Ollama pull,
	// model filter, advanced, enable, delete), persisted via the API. New servers
	// are added through a Verify then Save card.

	interface ApiServer {
		id: string;
		connectionType: string;
		baseUrl?: string;
		imageBaseUrl?: string | null;
		label: string | null;
		modelFilter?: string | null;
		isEnabled: boolean;
		verifiedAt?: string | null;
		color?: string | null;
		modelLabels?: Record<string, string>;
		modelPricing?: Record<string, ModelPrice>;
		modelKinds?: Record<string, ModelKind>;
		loadOptions?: LoadOptions;
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
	 * the real one: a wrong answer shown confidently for as long as the request takes.
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
		color: '',
		/** Filled in alongside the base URL for the providers that split the two. */
		imageBaseUrl: ''
	});
	/** Drives the placeholders of the "add a server" form. */
	const draftProvider = $derived(getProvider(draft.connectionType as ConnectionType));
	const draftDescriptor = $derived(describeProvider(draft.connectionType));
	/** Set on the providers whose endpoint is built from one short value. */
	const draftUrlField = $derived(draftDescriptor.urlField);

	/** The form is folded away until somebody asks for it, and reset when it closes. */
	let adding = $state(false);
	/** Step two. Separate from `draft.connectionType`, which always holds something. */
	let chosen = $state(false);

	/**
	 * One click, three steps.
	 *
	 * Verifying, saving and then syncing the catalogue used to be three separate
	 * presses, and the third one was not even in this section: a connection could
	 * sit there saved and empty until somebody found the sync button on it. They
	 * are one action because they are one intention.
	 */
	let connecting = $state(false);
	let modelCount = $state(0);
	let justAddedId = $state<string | null>(null);

	function toServer(v: ApiServer): Server {
		return {
			id: v.id,
			connectionType: v.connectionType as ConnectionType,
			baseUrl: v.baseUrl ?? '',
			imageBaseUrl: v.imageBaseUrl ?? undefined,
			label: v.label ?? undefined,
			modelFilter: v.modelFilter ?? undefined,
			isEnabled: v.isEnabled,
			// Restored from the server, so the badge survives a reload.
			isVerified: v.verifiedAt ? new Date(v.verifiedAt) : null,
			color: v.color ?? undefined,
			modelLabels: v.modelLabels ?? undefined,
			modelPricing: v.modelPricing ?? undefined,
			modelKinds: v.modelKinds ?? undefined,
			loadOptions: v.loadOptions ?? undefined,
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
	 * `/api/providers` cache answers, which is usually already warm: the sessions
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
		// which is otherwise only filled at boot: refresh it too, or the change
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
			imageBaseUrl: '',
			label: '',
			apiKey: '',
			modelFilter: preset.modelFilter ?? '',
			color: preset.color ?? ''
		};
	}

	function choose(type: ConnectionType) {
		selectPreset(type);
		chosen = true;
	}

	function cancelDraft() {
		adding = false;
		chosen = false;
		selectPreset(ConnectionType.Ollama);
	}

	async function connectDraft() {
		if (!draft.baseUrl) return toast.error($LL.baseUrlRequired());
		connecting = true;
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
			if (!result?.ok) {
				toast.error($LL.connectionFailed(), { description: result?.error });
				return;
			}
			modelCount = result.models?.length ?? 0;

			const created = await api<{ id: string }>(base, 'POST', {
				connectionType: draft.connectionType,
				baseUrl: draft.baseUrl,
				imageBaseUrl: draft.imageBaseUrl || null,
				label: draft.label || null,
				modelFilter: draft.modelFilter || null,
				apiKey: draft.apiKey || null,
				color: draft.color || null,
				isEnabled: true
			});

			await load(true);
			// The catalogue is cached for the session, so a new connection stays
			// invisible in every model picker until this runs. It is the step people
			// used to have to find on their own.
			await refreshCatalogue();

			justAddedId = created?.id ?? null;
			cancelDraft();
			toast.success($LL.serverAdded(), { description: $LL.modelsFound({ count: modelCount }) });
		} catch {
			// `api()` has already said what went wrong.
		} finally {
			connecting = false;
		}
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
					imageBaseUrl: server.imageBaseUrl ?? null,
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
					modelKinds: server.modelKinds ?? {},
					loadOptions: server.loadOptions ?? {},
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
				<div class="border-shade-3 rounded-xl border">
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
			<!-- Adding one is two steps, and only one of them is on screen at a time:
			     which provider, then what it needs. The old card asked both at once,
			     with every field visible before anyone had said what they were
			     connecting to, and a row of chips that only worked while there were
			     five of them. -->
			<SettingsSection title={$LL.addAServer()}>
				{#if !adding}
					<button
						type="button"
						onclick={() => (adding = true)}
						class="border-shade-4 text-muted hover:border-accent hover:text-active flex items-center justify-center gap-2 rounded-xl border border-dashed p-4 text-sm transition-colors"
					>
						<Plus class="base-icon" />
						{$LL.addAServer()}
					</button>
				{:else}
					<div class="border-shade-4 flex flex-col gap-3 rounded-xl border border-dashed p-4">
						{#if !chosen}
							<ProviderPicker onSelect={choose} />
							<button
								type="button"
								onclick={cancelDraft}
								class="text-muted hover:text-active self-start text-xs transition-colors"
							>
								{$LL.cancel()}
							</button>
						{:else}
							<!-- The choice, kept in view and reversible in one click. A form that
							     hides what it is a form for makes people cancel to check. -->
							<div class="flex items-center gap-2.5">
								<span
									class="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-sm font-medium"
									style="background-color: color-mix(in srgb, {draftDescriptor.badge
										.color} 16%, transparent); color: {draftDescriptor.badge.color}"
									aria-hidden="true"
								>
									{draftProvider.name.slice(0, 1)}
								</span>
								<!-- The heading is the label. Naming a connection is renaming what
								     is already on screen, so it is the same field, the same ghost input
								     as a model's name: text until it is wanted, the provider's own name
								     as the placeholder. A row of its own for it was a second question
								     asking the same thing. -->
								<input
									class="text-active placeholder:text-active hover:border-shade-3 focus:border-shade-3 focus:bg-shade-0 min-w-0 flex-1 rounded-md border border-transparent px-2 py-1 text-sm font-medium outline-none"
									bind:value={draft.label}
									placeholder={draftProvider.name}
									aria-label={$LL.label()}
									title={$LL.label()}
								/>
								<button
									type="button"
									onclick={() => (chosen = false)}
									class="text-link shrink-0 text-xs hover:underline"
								>
									{$LL.change()}
								</button>
							</div>

							<!-- One column, and only what it takes to connect. Two fields in a
							     two-column grid left a half-width box beside a hole, and most
							     providers ask for a single thing. The label, the model filter and
							     the rest are on the connection itself, which opens as soon as this
							     succeeds: they are things to adjust, not things to answer. -->
							<div class="flex flex-col gap-3">
								<!-- Same rule as an existing connection: a provider whose endpoint is
								     a function of one value asks for that value. Leaving it empty
								     leaves the URL empty, and the button stays disabled. Which
								     providers work this way is in their own file, not here. -->
								{#if draftUrlField}
									<SettingsField label={$LL[draftUrlField.label as 'productId']()}>
										<input
											class="settings-field font-mono text-xs"
											value={draftUrlField.fromBaseUrl(draft.baseUrl)}
											placeholder={draftUrlField.placeholder}
											oninput={(e) => {
												draft.baseUrl = draftUrlField.toBaseUrl(e.currentTarget.value);
												draft.imageBaseUrl = draftDescriptor.imageBaseFrom?.(draft.baseUrl) ?? '';
											}}
										/>
									</SettingsField>
								{:else if !draftProvider.identified}
									<!-- Only the providers whose endpoint is theirs to choose. OpenAI and
									     Claude have one fixed address that the app already knows, so asking
									     for it offers nothing but a chance to get it wrong; anyone pointing
									     at something else wants the OpenAI-compatible entry, which is what
									     it is there for. An existing connection can still be redirected,
									     under Advanced, where a rare need belongs. -->
									<SettingsField label={$LL.baseUrl()}>
										<input
											class="settings-field font-mono text-xs"
											bind:value={draft.baseUrl}
											placeholder={draftProvider.baseUrl}
										/>
									</SettingsField>
								{/if}

								{#if draftProvider.requiresApiKey || !draftProvider.identified}
									<!-- Asked for where it is wanted. A local Ollama has no key, and a
									     field for one is a question with no answer. -->
									<SettingsField label={$LL.apiKey()}>
										<input
											class="settings-field"
											type="password"
											autocomplete="off"
											bind:value={draft.apiKey}
											placeholder={draftProvider.requiresApiKey ? 'sk-…' : $LL.optional()}
										/>
										{#if draftProvider.apiKeyHelpUrl}
											<!-- Under the field it answers, and out of the provider's own
											     descriptor: nothing here knows where anybody's keys live. -->
											<Button
												variant="link"
												href={draftProvider.apiKeyHelpUrl}
												target="_blank"
												class="w-fit text-xs"
											>
												{$LL.howToObtainApiKey()}
											</Button>
										{/if}
									</SettingsField>
								{/if}
							</div>

							<!-- The footer fills the line. Two small buttons touching in the left
							     corner of a card this wide read as leftovers; the one you came for
							     takes the room, and the way out keeps its own end. -->
							<div class="border-shade-3 flex items-center gap-2 border-t pt-3">
								<Button
									class="flex-1"
									onclick={connectDraft}
									disabled={connecting || !draft.baseUrl}
								>
									{#if connecting}
										<LoaderCircle class="base-icon animate-spin" />
										{$LL.connecting()}
									{:else}
										<Check class="base-icon" />
										{$LL.connect()}
									{/if}
								</Button>
								<Button variant="outline" onclick={cancelDraft}>{$LL.cancel()}</Button>
							</div>
						{/if}
					</div>
				{/if}
			</SettingsSection>
		{/if}
	</SettingsPanel>
{/if}
