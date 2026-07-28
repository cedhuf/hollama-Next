<script lang="ts">
	import { ChevronDown, ChevronUp, LoaderCircle, Pencil, RefreshCw } from '@lucide/svelte';
	import Trash_2 from '@lucide/svelte/icons/trash-2';
	import { toast } from 'svelte-sonner';

	import LL from '$i18n/i18n-svelte';
	import { OllamaStrategy } from '$lib/chat/ollama';
	import { OpenAIStrategy } from '$lib/chat/openai';
	import Badge from '$lib/components/Badge.svelte';
	import Button from '$lib/components/Button.svelte';
	import FieldCheckbox from '$lib/components/FieldCheckbox.svelte';
	import FieldHelp from '$lib/components/FieldHelp.svelte';
	import FieldInput from '$lib/components/FieldInput.svelte';
	import Fieldset from '$lib/components/Fieldset.svelte';
	import P from '$lib/components/P.svelte';
	import {
		ConnectionType,
		getProvider,
		isOpenAiCompatible,
		SERVER_COLORS,
		serverBadge,
		type Server
	} from '$lib/connections';

	import OllamaBaseURLHelp from './ollama/BaseURLHelp.svelte';
	import PullModel from './ollama/PullModel.svelte';

	interface Props {
		/** The server to edit (mutated in place via bindings). */
		server: Server;
		/** Called after any field changes, so the parent can persist. */
		onChange: () => void;
		/** Called to delete this server. */
		onDelete: () => void;
		/** Start with the endpoint details expanded (e.g. a freshly-added server). */
		startEditing?: boolean;
		/** Called after a successful sync, so the parent can refresh the catalogue. */
		onSynced?: () => Promise<void> | void;
	}

	let { server, onChange, onDelete, startEditing = false, onSynced }: Props = $props();
	let strategy: OllamaStrategy | OpenAIStrategy;
	let isLoading = $state(false);
	let showAdvanced = $state(false);
	// svelte-ignore state_referenced_locally
	let editing = $state(startEditing);

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
	const badgeVariant = $derived(
		server.connectionType === ConnectionType.OpenAI
			? ConnectionType.OpenAI
			: server.connectionType === ConnectionType.Ollama
				? ConnectionType.Ollama
				: undefined
	);

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

		strategy = isOpenAiFamily ? new OpenAIStrategy(server) : new OllamaStrategy(server);
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

	function deleteServer() {
		onDelete();
	}
</script>

<div data-testid="server">
	<Fieldset>
		{#snippet legend()}
			{#if badgeVariant}
				<Badge variant={badgeVariant} />
			{/if}
			<Badge>{server.label ? server.label : provider.name}</Badge>
			<!-- The colour that identifies this connection wherever its models appear. -->
			<span
				class="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
				style="background-color: {badge.color}"
				title={badge.id || $LL.color()}
			></span>
			<span
				class="ml-1.5 inline-flex items-center gap-1 text-[11px] {syncedAt
					? 'text-positive'
					: 'text-muted'}"
				title={syncedAt ? `Last synced ${syncedAt.toLocaleString()}` : 'Never synced'}
			>
				<span
					class="inline-block h-1.5 w-1.5 rounded-full {syncedAt ? 'bg-positive' : 'bg-shade-4'}"
				></span>
				{syncedAt ? 'Synced' : 'Not synced'}
			</span>
		{/snippet}

		<Fieldset>
			<nav class="flex items-stretch gap-x-2">
				<FieldCheckbox
					label={$LL.useModelsFromThisServer()}
					bind:checked={server.isEnabled}
					onChange={persist}
				/>

				<Button
					class="max-h-full"
					variant="outline"
					onclick={deleteServer}
					aria-label={$LL.deleteServer()}
				>
					<Trash_2 class="base-icon" />
				</Button>

				<!-- One stable label: the button no longer changes width (nor says "Re-…")
				     once the connection has been verified. -->
				<Button
					disabled={isLoading || !server.baseUrl}
					variant={!server.isVerified ? 'default' : 'outline'}
					onclick={syncServer}
					title={$LL.sync()}
				>
					{#if isLoading}
						<LoaderCircle class="base-icon animate-spin" />
					{:else}
						<RefreshCw class="base-icon" />
					{/if}
					{$LL.sync()}
				</Button>

				<Button
					variant="outline"
					isActive={editing}
					onclick={() => (editing = !editing)}
					aria-label="Edit connection"
				>
					<Pencil class="base-icon" />
				</Button>
			</nav>

			{#if editing}
				<div class="flex flex-col gap-2 sm:grid sm:grid-cols-2">
					<!-- Primary credential fields -->
					<div class="col-span-2 grid gap-2 sm:grid-cols-2">
						{#if isOpenAiFamily}
							<FieldInput
								type="password"
								name={`apiKey-${server.id}`}
								label={$LL.apiKey()}
								bind:value={server.apiKey}
								on:input={persist}
							>
								<svelte:fragment slot="help">
									{#if provider.apiKeyHelpUrl}
										<FieldHelp>
											<P>
												<Button variant="link" href={provider.apiKeyHelpUrl} target="_blank">
													{$LL.howToObtainApiKey()}
												</Button>
											</P>
										</FieldHelp>
									{/if}
								</svelte:fragment>
							</FieldInput>
						{/if}

						<!-- User-defined endpoints expose the Base URL directly -->
						{#if !provider.identified}
							<FieldInput
								name={`server-${server.id}`}
								label={$LL.baseUrl()}
								placeholder={server.baseUrl}
								bind:value={server.baseUrl}
								on:input={persist}
							>
								<svelte:fragment slot="help">
									{#if isOllamaFamily}
										<OllamaBaseURLHelp {server} />
									{:else if isInfomaniak}
										<FieldHelp>
											<P>{$LL.infomaniakUrlHelp()}</P>
										</FieldHelp>
									{/if}
								</svelte:fragment>
							</FieldInput>
						{/if}
					</div>

					<FieldInput
						name={`modelsFilter-${server.id}`}
						label={$LL.modelsFilter()}
						placeholder="gpt"
						bind:value={server.modelFilter}
						on:input={persist}
					>
						<svelte:fragment slot="help">
							<FieldHelp>
								<P>
									{$LL.modelsFilterHelp()}
								</P>
							</FieldHelp>
						</svelte:fragment>
					</FieldInput>

					<FieldInput
						name={`label-${server.id}`}
						label={$LL.label()}
						bind:value={server.label}
						placeholder="my-llama-server"
						on:input={persist}
					>
						<svelte:fragment slot="help">
							<FieldHelp>
								<P>{$LL.connectionLabelHelp()}</P>
							</FieldHelp>
						</svelte:fragment>
					</FieldInput>

					<!-- The badge colour is what identifies this connection in the model list,
					     so it is picked here rather than being locked to the provider type. -->
					<div class="flex flex-col gap-1.5">
						<span class="text-xs font-medium">{$LL.color()}</span>
						<div class="flex flex-wrap items-center gap-2">
							{#each SERVER_COLORS as swatch (swatch)}
								<button
									type="button"
									aria-label={swatch}
									aria-pressed={badge.color.toLowerCase() === swatch.toLowerCase()}
									onclick={() => {
										server.color = swatch;
										persist();
									}}
									class="h-6 w-6 rounded-full ring-2 ring-offset-2 ring-offset-shade-0 transition-all {badge.color.toLowerCase() ===
									swatch.toLowerCase()
										? 'ring-accent'
										: 'ring-transparent hover:ring-shade-4'}"
									style="background-color: {swatch}"
								></button>
							{/each}
							{#if server.color}
								<button
									type="button"
									onclick={() => {
										server.color = undefined;
										persist();
									}}
									class="text-xs text-muted transition-colors hover:text-active"
								>
									{$LL.reset()}
								</button>
							{/if}
						</div>
					</div>
				</div>

				<!-- Identified providers keep their preset endpoint tucked away -->
				{#if provider.identified}
					<button
						type="button"
						onclick={() => (showAdvanced = !showAdvanced)}
						class="flex w-fit items-center gap-1 text-xs text-muted transition-colors hover:text-active"
					>
						{#if showAdvanced}
							<ChevronUp class="h-3.5 w-3.5" />
						{:else}
							<ChevronDown class="h-3.5 w-3.5" />
						{/if}
						{$LL.advancedSettings()}
					</button>

					{#if showAdvanced}
						<FieldInput
							name={`server-${server.id}`}
							label={$LL.baseUrl()}
							placeholder={server.baseUrl}
							bind:value={server.baseUrl}
							on:input={persist}
						/>
					{/if}
				{/if}

				{#if isOllamaFamily}
					<PullModel {server} />
				{/if}
			{/if}
		</Fieldset>
	</Fieldset>
</div>
