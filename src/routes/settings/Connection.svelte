<script lang="ts">
	import { KeyRound, LoaderCircle, RefreshCw, Tags, X } from '@lucide/svelte';

	import LL from '$i18n/i18n-svelte';
	import { OllamaStrategy } from '$lib/chat/ollama';
	import { OpenAIStrategy } from '$lib/chat/openai';
	import Button from '$lib/components/Button.svelte';
	import ButtonConfirm from '$lib/components/ButtonConfirm.svelte';
	import {
		ConnectionType,
		getProvider,
		isOpenAiCompatible,
		SERVER_COLORS,
		serverBadge,
		serverInitials,
		supportsImageGeneration,
		type Server
	} from '$lib/connections';
	import { settingsStore } from '$lib/localStorage';
	import { describeProvider } from '$lib/providers';
	import { toast } from '$lib/toast';

	import ConnectionLoadOptions from './ConnectionLoadOptions.svelte';
	import OllamaBaseURLHelp from './ollama/BaseURLHelp.svelte';
	import PullModel from './ollama/PullModel.svelte';
	import SettingsCard from './SettingsCard.svelte';
	import SettingsField from './SettingsField.svelte';

	/**
	 * One provider connection, as a card that stays quiet until you open it.
	 *
	 * Collapsed it answers the only questions worth asking at a glance: is it
	 * live, and how many models does it bring? Everything editable lives inside,
	 * on the same `SettingsField` / `settings-field` grid as the other settings
	 * tabs, so this stops being the one screen with its own look.
	 */
	interface Props {
		/** The server to edit (mutated in place via bindings). */
		server: Server;
		/** Called after any field changes, so the parent can persist. */
		onChange: () => void;
		/** Called to delete this server. */
		onDelete: () => void;
		/** Start with the card open (e.g. a freshly-added server). */
		startEditing?: boolean;
		/**
		 * Server mode never sends keys back to the browser, so `server.apiKey` is
		 * blank even when one is stored. This says whether to show "Key saved"
		 * instead of an empty field that reads as "no key".
		 */
		hasApiKey?: boolean;
		/** Called after a successful sync, so the parent can refresh the catalogue. */
		onSynced?: () => Promise<void> | void;
		/** Opens the model-name editor for this connection (a sub-view, not a modal). */
		onRenameModels?: () => void;
	}

	let {
		server,
		onChange,
		onDelete,
		startEditing = false,
		hasApiKey = false,
		onSynced,
		onRenameModels
	}: Props = $props();

	let isLoading = $state(false);
	let showAdvanced = $state(false);
	/** Set once the user chooses to type a new key over a stored one. */
	let replacingKey = $state(false);
	// svelte-ignore state_referenced_locally
	let open = $state(startEditing);

	/** `isVerified` arrives as a Date locally and as an ISO string from the API. */
	const syncedAt = $derived(
		server.isVerified
			? server.isVerified instanceof Date
				? server.isVerified
				: new Date(server.isVerified)
			: null
	);

	const badge = $derived(serverBadge(server));
	const provider = $derived(getProvider(server.connectionType));
	const isOpenAiFamily = $derived(isOpenAiCompatible(server.connectionType));
	const isOllamaFamily = $derived(server.connectionType === ConnectionType.Ollama);
	const descriptor = $derived(describeProvider(server.connectionType));
	const urlField = $derived(descriptor.urlField);
	const canDraw = $derived(supportsImageGeneration(server.connectionType));

	const name = $derived(server.label || provider.name);
	const initials = $derived(serverInitials(name));
	const modelCount = $derived(
		($settingsStore.models ?? []).filter((model) => model.serverId === server.id).length
	);
	/** Show the stored-key affordance until the user opts into typing a new one. */
	const keyIsStored = $derived(hasApiKey && !server.apiKey && !replacingKey);

	// Bindings mutate `server` in place; let the parent persist however it wants.
	function persist() {
		onChange();
	}

	/**
	 * One action for the whole round-trip: check the endpoint answers, stamp the
	 * verified date (persisted by the parent) and pull this provider's models in.
	 * There is no separate "verify" and "refresh": syncing is what both meant.
	 */
	async function syncServer() {
		isLoading = true;
		const toastId = toast.loading($LL.connecting());

		const strategy = isOpenAiFamily ? new OpenAIStrategy(server) : new OllamaStrategy(server);
		const ok = await strategy.verifyServer();
		server.isVerified = ok ? new Date() : null;

		if (ok) {
			server.isEnabled = true;
			persist();
			try {
				await onSynced?.();
			} catch {
				// The connection is fine; only the catalogue refresh failed.
			}
			toast.success($LL.connectionIsVerified(), { id: toastId });
		} else {
			persist();
			toast.error($LL.connectionFailedToVerify(), { id: toastId });
		}
		isLoading = false;
	}
</script>

<SettingsCard
	bind:open
	testId="server"
	label={$LL.connectionSettings()}
	bind:enabled={server.isEnabled}
	enabledLabel={$LL.useModelsFromThisServer()}
	onToggle={persist}
	healthy={!!syncedAt}
	iconClass="text-xs font-semibold tracking-tight"
	iconStyle="background-color: {badge.color}1f; color: {badge.color}"
>
	{#snippet icon()}
		<!-- The connection's colour, doing real work: it's the same accent its
		     models wear in every picker. -->
		{initials}
	{/snippet}

	{#snippet title()}
		<span class="flex max-w-full items-center gap-1.5">
			<span class="text-active truncate text-sm font-medium">{name}</span>
			<!-- Only when the label is something other than the provider's own name,
			     so a connection called "Ollama" doesn't say Ollama twice. -->
			{#if name !== provider.name}
				<span class="badge shrink-0">{provider.name}</span>
			{/if}
		</span>
	{/snippet}

	{#snippet subtitle()}
		<span class="truncate" title={syncedAt ? syncedAt.toLocaleString() : $LL.neverSynced()}>
			{syncedAt ? $LL.synced() : $LL.notSynced()}
			{#if syncedAt && modelCount}
				· {$LL.modelsCount({ count: modelCount })}
			{/if}
		</span>
	{/snippet}

	{#snippet actions()}
		<Button
			variant="icon"
			disabled={isLoading || !server.baseUrl}
			onclick={syncServer}
			aria-label={$LL.sync()}
			title={syncedAt ? $LL.lastSynced({ date: syncedAt.toLocaleString() }) : $LL.neverSynced()}
		>
			{#if isLoading}
				<LoaderCircle class="base-icon animate-spin" />
			{:else}
				<RefreshCw class="base-icon" />
			{/if}
		</Button>
	{/snippet}

	<div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
		<!-- User-defined endpoints expose the Base URL directly; identified
				     providers keep their preset one under Advanced. -->
		{#if !provider.identified}
			<SettingsField label={$LL.baseUrl()}>
				<input
					class="settings-field font-mono text-xs"
					bind:value={server.baseUrl}
					placeholder={provider.baseUrl}
					oninput={persist}
				/>
			</SettingsField>
		{/if}

		<!-- Some providers' endpoints differ only by one value in their path, so
				     that is what the form asks for and the URL is derived from it. An empty
				     value leaves it empty, which is what stops the connection being synced
				     before it can work.

				     Both URLs from the one field, because a provider whose images are not
				     under its chat endpoint would otherwise have to ask twice for the same
				     value, which is asking the reader to know why. Which providers work
				     this way, and how, is in their own file. -->
		{#if urlField}
			<SettingsField label={$LL[urlField.label as 'productId']()}>
				<input
					class="settings-field font-mono text-xs"
					value={urlField.fromBaseUrl(server.baseUrl)}
					placeholder={urlField.placeholder}
					oninput={(e) => {
						server.baseUrl = urlField.toBaseUrl(e.currentTarget.value);
						server.imageBaseUrl = descriptor.imageBaseFrom?.(server.baseUrl) ?? '';
						persist();
					}}
				/>
			</SettingsField>
		{/if}

		{#if isOpenAiFamily}
			<SettingsField label={$LL.apiKey()}>
				{#if keyIsStored}
					<!-- A stored key is never returned by the API. Showing the empty
							     password field would read as "no key configured". -->
					<div
						class="border-shade-3 bg-shade-1 flex items-center gap-2 rounded-md border px-2.5 py-1.5"
					>
						<KeyRound class="text-positive h-3.5 w-3.5 shrink-0" />
						<span class="text-muted flex-1 text-sm">{$LL.apiKeySaved()}</span>
						<button type="button" onclick={() => (replacingKey = true)} class="text-link text-xs">
							{$LL.apiKeyReplace()}
						</button>
					</div>
				{:else}
					<div class="flex items-center gap-2">
						<input
							class="settings-field"
							type="password"
							autocomplete="off"
							placeholder="sk-…"
							bind:value={server.apiKey}
							oninput={persist}
						/>
						{#if hasApiKey}
							<button
								type="button"
								onclick={() => {
									server.apiKey = '';
									replacingKey = false;
								}}
								aria-label={$LL.apiKeyKeep()}
								title={$LL.apiKeyKeep()}
								class="text-muted hover:text-active shrink-0 rounded-md p-1.5 transition-colors"
							>
								<X class="h-4 w-4" />
							</button>
						{/if}
					</div>
				{/if}
				{#if provider.apiKeyHelpUrl && !keyIsStored}
					<!-- Kept next to the field it answers: "where do I get this?" only
							     ever comes up while the field is empty. -->
					<Button
						variant="link"
						href={provider.apiKeyHelpUrl}
						target="_blank"
						class="w-fit text-xs"
					>
						{$LL.howToObtainApiKey()}
					</Button>
				{/if}
			</SettingsField>
		{/if}

		<SettingsField label={$LL.label()}>
			<input
				class="settings-field"
				bind:value={server.label}
				placeholder={provider.name}
				oninput={persist}
			/>
		</SettingsField>

		<SettingsField label={$LL.modelsFilter()}>
			<input
				class="settings-field"
				bind:value={server.modelFilter}
				placeholder="gpt"
				oninput={persist}
			/>
		</SettingsField>
	</div>

	<!-- The accent this connection's models wear in every picker. Assigned at
			     creation from whatever the other connections aren't using; changing it
			     is just picking another swatch. -->
	<div class="flex flex-wrap items-center gap-2">
		<span class="text-active mr-1 text-sm font-medium">{$LL.color()}</span>
		{#each SERVER_COLORS as swatch (swatch)}
			<button
				type="button"
				aria-label={swatch}
				aria-pressed={badge.color.toLowerCase() === swatch.toLowerCase()}
				onclick={() => {
					server.color = swatch;
					persist();
				}}
				class="ring-offset-shade-0 h-5 w-5 rounded-full ring-2 ring-offset-2 transition-all {badge.color.toLowerCase() ===
				swatch.toLowerCase()
					? 'ring-accent'
					: 'hover:ring-shade-4 ring-transparent'}"
				style="background-color: {swatch}"
			></button>
		{/each}
	</div>

	<!-- Kept where the other help text went: this one is not a description of a
			     field, it is the fix for the CORS failure that stops Ollama connecting,
			     and it only shows while the connection is still unverified. -->
	{#if isOllamaFamily}
		<OllamaBaseURLHelp {server} />
	{/if}

	{#if showAdvanced}
		{#if provider.identified}
			<SettingsField label={$LL.baseUrl()}>
				<input
					class="settings-field font-mono text-xs"
					bind:value={server.baseUrl}
					placeholder={provider.baseUrl}
					oninput={persist}
				/>
			</SettingsField>
		{/if}

		<!-- Empty means "wherever chat is", which is true of every provider that
				     serves both from one root, so this stays a field nobody has to think
				     about until their provider makes them. The placeholder shows what it
				     falls back to rather than a fictional example. -->
		{#if canDraw}
			<SettingsField label={$LL.imageEndpoint()} hint={$LL.imageEndpointHelp()}>
				<input
					class="settings-field font-mono text-xs"
					bind:value={server.imageBaseUrl}
					placeholder={server.baseUrl || provider.baseUrl}
					oninput={persist}
				/>
			</SettingsField>
		{/if}
	{/if}

	{#if isOllamaFamily}
		<PullModel {server} />
	{/if}

	<!-- How the model is loaded, which is a fact about this machine and not
			     about any one conversation. Under Advanced because a working Ollama
			     needs none of it: every field left blank is Ollama deciding, which is
			     the right answer until somebody has a reason it is not.

			     Below the pull field rather than above it, following the order of the
			     work: you fetch a model first, and only then wonder how the machine
			     should load it. -->
	{#if showAdvanced && isOllamaFamily}
		<div class="border-shade-3 border-t pt-3">
			<ConnectionLoadOptions bind:server onChange={persist} />
		</div>
	{/if}

	<!-- Footer: the occasional actions, kept out of the way of the fields.
			     Delete confirms in place rather than through a dialog. -->
	<div class="border-shade-3 flex flex-wrap items-center gap-x-4 gap-y-2 border-t pt-3">
		{#if onRenameModels}
			<button
				type="button"
				onclick={onRenameModels}
				class="text-link flex items-center gap-1.5 text-xs"
			>
				<Tags class="h-3.5 w-3.5" />
				{$LL.modelNames()}
			</button>
		{/if}

		{#if provider.identified || canDraw || isOllamaFamily}
			<button
				type="button"
				onclick={() => (showAdvanced = !showAdvanced)}
				class="text-muted hover:text-active text-xs transition-colors"
			>
				{$LL.advancedSettings()}
			</button>
		{/if}

		<div class="ml-auto flex items-center gap-2">
			<ButtonConfirm onConfirm={onDelete} label={$LL.deleteServer()} />
		</div>
	</div>
</SettingsCard>
