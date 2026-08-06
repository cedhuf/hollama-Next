<script lang="ts">
	import { ChevronDown, KeyRound, LoaderCircle, RefreshCw, Tags, Trash2, X } from '@lucide/svelte';
	import { toast } from 'svelte-sonner';
	import { slide } from 'svelte/transition';

	import LL from '$i18n/i18n-svelte';
	import { OllamaStrategy } from '$lib/chat/ollama';
	import { OpenAIStrategy } from '$lib/chat/openai';
	import Button from '$lib/components/Button.svelte';
	import {
		ConnectionType,
		getProvider,
		infomaniakBaseUrl,
		infomaniakProductId,
		isOpenAiCompatible,
		SERVER_COLORS,
		serverBadge,
		serverInitials,
		type Server
	} from '$lib/connections';
	import { settingsStore } from '$lib/localStorage';

	import OllamaBaseURLHelp from './ollama/BaseURLHelp.svelte';
	import PullModel from './ollama/PullModel.svelte';
	import SettingsField from './SettingsField.svelte';

	/**
	 * One provider connection, as a card that stays quiet until you open it.
	 *
	 * Collapsed it answers the only questions worth asking at a glance — is it
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
		 * blank even when one is stored — this says whether to show "Key saved"
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
	let confirmingDelete = $state(false);
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
	const isInfomaniak = $derived(server.connectionType === ConnectionType.Infomaniak);

	const name = $derived(server.label || provider.name);
	const initials = $derived(serverInitials(name));
	const modelCount = $derived(
		($settingsStore.models ?? []).filter((model) => model.serverId === server.id).length
	);
	/** Show the stored-key affordance until the user opts into typing a new one. */
	const keyIsStored = $derived(hasApiKey && !server.apiKey && !replacingKey);

	// Bindings mutate `server` in place; let the parent persist however it wants
	// (force a fresh store array in local mode, PUT to the API in server mode).
	function persist() {
		onChange();
	}

	/**
	 * One action for the whole round-trip: check the endpoint answers, stamp the
	 * verified date (persisted by the parent) and pull this provider's models in.
	 * There is no separate "verify" and "refresh" — syncing is what both meant.
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

<div
	data-testid="server"
	class="overflow-hidden rounded-xl border bg-shade-0 transition-colors {open
		? 'border-shade-4'
		: 'border-shade-3'}"
>
	<!-- Header: identity, health, and the two actions worth having without opening
	     the card. Not a single button, so the sync control can live beside the
	     expand target rather than nested inside it. -->
	<div class="flex items-center gap-3 p-3">
		<button
			type="button"
			onclick={() => (open = !open)}
			aria-expanded={open}
			class="flex min-w-0 flex-1 items-center gap-3 text-left"
		>
			<!-- The connection's colour, doing real work: it's the same accent its
			     models wear in every picker. -->
			<span
				class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-xs font-semibold tracking-tight"
				style="background-color: {badge.color}1f; color: {badge.color}"
			>
				{initials}
			</span>

			<span class="flex min-w-0 flex-col">
				<span class="flex items-center gap-1.5">
					<span class="truncate text-sm font-medium text-active">{name}</span>
					<!-- Only when the label is something other than the provider's own name,
					     so a connection called "Ollama" doesn't say Ollama twice. -->
					{#if name !== provider.name}
						<span class="badge shrink-0">{provider.name}</span>
					{/if}
				</span>
				<span class="flex items-center gap-1.5 text-xs text-muted">
					<span
						class="inline-block h-1.5 w-1.5 shrink-0 rounded-full {syncedAt
							? 'bg-positive'
							: 'bg-shade-4'}"
					></span>
					<span class="truncate" title={syncedAt ? syncedAt.toLocaleString() : $LL.neverSynced()}>
						{syncedAt ? $LL.synced() : $LL.notSynced()}
						{#if syncedAt && modelCount}
							· {$LL.modelsCount({ count: modelCount })}
						{/if}
					</span>
				</span>
			</span>
		</button>

		<!-- Whether this connection's models show up at all: a state you want to flip
		     and see at a glance, so it belongs out here rather than inside the form. -->
		<label class="flex shrink-0 cursor-pointer items-center" title={$LL.useModelsFromThisServer()}>
			<input
				type="checkbox"
				bind:checked={server.isEnabled}
				onchange={persist}
				aria-label={$LL.useModelsFromThisServer()}
				class="peer sr-only"
			/>
			<span
				class="relative h-5 w-9 rounded-full bg-shade-3 transition-colors after:absolute after:left-0.5 after:top-0.5 after:h-4 after:w-4 after:rounded-full after:bg-white after:transition-transform peer-checked:bg-accent peer-checked:after:translate-x-4 peer-focus-visible:ring-2 peer-focus-visible:ring-accent"
			></span>
		</label>

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

		<button
			type="button"
			onclick={() => (open = !open)}
			aria-label={$LL.connectionSettings()}
			aria-expanded={open}
			class="shrink-0 rounded-md p-1 text-muted transition-colors hover:text-active"
		>
			<ChevronDown class="base-icon transition-transform {open ? 'rotate-180' : ''}" />
		</button>
	</div>

	{#if open}
		<div
			class="flex flex-col gap-4 border-t border-shade-3 p-4"
			transition:slide={{ duration: 150 }}
		>
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

				<!-- Infomaniak's endpoint differs only by the product ID in its path, so
				     that is what the form asks for and the URL is derived from it. An
				     empty ID leaves the URL empty, which is what stops the connection
				     being synced before it can work. -->
				{#if provider.type === ConnectionType.Infomaniak}
					<SettingsField label={$LL.infomaniakProductId()} hint={$LL.infomaniakProductIdHelp()}>
						<input
							class="settings-field font-mono text-xs"
							value={infomaniakProductId(server.baseUrl)}
							placeholder="123456"
							oninput={(e) => {
								server.baseUrl = infomaniakBaseUrl(e.currentTarget.value);
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
								class="flex items-center gap-2 rounded-md border border-shade-3 bg-shade-1 px-2.5 py-1.5"
							>
								<KeyRound class="h-3.5 w-3.5 shrink-0 text-positive" />
								<span class="flex-1 text-sm text-muted">{$LL.apiKeySaved()}</span>
								<button
									type="button"
									onclick={() => (replacingKey = true)}
									class="text-xs text-link"
								>
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
										class="shrink-0 rounded-md p-1.5 text-muted transition-colors hover:text-active"
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

				<SettingsField label={$LL.label()} hint={$LL.connectionLabelHelp()}>
					<input
						class="settings-field"
						bind:value={server.label}
						placeholder={provider.name}
						oninput={persist}
					/>
				</SettingsField>

				<SettingsField label={$LL.modelsFilter()} hint={$LL.modelsFilterHelp()}>
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
				<span class="mr-1 text-sm font-medium text-active">{$LL.color()}</span>
				{#each SERVER_COLORS as swatch (swatch)}
					<button
						type="button"
						aria-label={swatch}
						aria-pressed={badge.color.toLowerCase() === swatch.toLowerCase()}
						onclick={() => {
							server.color = swatch;
							persist();
						}}
						class="h-5 w-5 rounded-full ring-2 ring-offset-2 ring-offset-shade-0 transition-all {badge.color.toLowerCase() ===
						swatch.toLowerCase()
							? 'ring-accent'
							: 'ring-transparent hover:ring-shade-4'}"
						style="background-color: {swatch}"
					></button>
				{/each}
			</div>

			{#if isInfomaniak}
				<p class="text-xs leading-snug text-muted">{$LL.infomaniakUrlHelp()}</p>
			{:else if isOllamaFamily}
				<OllamaBaseURLHelp {server} />
			{/if}

			{#if provider.identified && showAdvanced}
				<SettingsField label={$LL.baseUrl()}>
					<input
						class="settings-field font-mono text-xs"
						bind:value={server.baseUrl}
						placeholder={provider.baseUrl}
						oninput={persist}
					/>
				</SettingsField>
			{/if}

			{#if isOllamaFamily}
				<PullModel {server} />
			{/if}

			<!-- Footer: the occasional actions, kept out of the way of the fields.
			     Delete confirms in place rather than through a dialog. -->
			<div class="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-shade-3 pt-3">
				{#if onRenameModels}
					<button
						type="button"
						onclick={onRenameModels}
						class="flex items-center gap-1.5 text-xs text-link"
					>
						<Tags class="h-3.5 w-3.5" />
						{$LL.modelNames()}
					</button>
				{/if}

				{#if provider.identified}
					<button
						type="button"
						onclick={() => (showAdvanced = !showAdvanced)}
						class="text-xs text-muted transition-colors hover:text-active"
					>
						{$LL.advancedSettings()}
					</button>
				{/if}

				<div class="ml-auto flex items-center gap-2">
					{#if confirmingDelete}
						<span class="text-xs text-muted">{$LL.confirmDeletion()}</span>
						<button
							type="button"
							onclick={onDelete}
							aria-label={$LL.deleteServer()}
							class="rounded-md bg-negative px-2 py-1 text-xs font-medium text-shade-0"
						>
							{$LL.delete()}
						</button>
						<button
							type="button"
							onclick={() => (confirmingDelete = false)}
							class="text-xs text-muted transition-colors hover:text-active"
						>
							{$LL.cancel()}
						</button>
					{:else}
						<button
							type="button"
							onclick={() => (confirmingDelete = true)}
							aria-label={$LL.deleteServer()}
							class="flex items-center gap-1.5 text-xs text-muted transition-colors hover:text-negative"
						>
							<Trash2 class="h-3.5 w-3.5" />
							{$LL.delete()}
						</button>
					{/if}
				</div>
			</div>
		</div>
	{/if}
</div>
