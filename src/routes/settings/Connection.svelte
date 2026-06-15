<script lang="ts">
	import { ChevronDown, ChevronUp, LoaderCircle, Pencil } from '@lucide/svelte';
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
	import { ConnectionType, getProvider, isOpenAiCompatible, type Server } from '$lib/connections';

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
	}

	let { server, onChange, onDelete, startEditing = false }: Props = $props();
	let strategy: OllamaStrategy | OpenAIStrategy;
	let isLoading = $state(false);
	let showAdvanced = $state(false);
	// svelte-ignore state_referenced_locally
	let editing = $state(startEditing);

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

	async function verifyServer() {
		isLoading = true;
		const toastId = toast.loading($LL.connecting());

		strategy = isOpenAiFamily ? new OpenAIStrategy(server) : new OllamaStrategy(server);
		server.isVerified = (await strategy.verifyServer()) ? new Date() : null;

		if (server.isVerified) {
			server.isEnabled = true;
			toast.success($LL.connectionIsVerified(), { id: toastId });
		} else {
			toast.error($LL.connectionFailedToVerify(), { id: toastId });
		}
		persist();
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
			<span
				class="ml-1.5 inline-flex items-center gap-1 text-[11px] {server.isVerified
					? 'text-positive'
					: 'text-muted'}"
				title={server.isVerified
					? `Last verified ${typeof server.isVerified === 'string' ? server.isVerified : server.isVerified instanceof Date ? server.isVerified.toLocaleDateString() : ''}`
					: 'Not yet verified'}
			>
				<span
					class="inline-block h-1.5 w-1.5 rounded-full {server.isVerified
						? 'bg-positive'
						: 'bg-shade-4'}"
				></span>
				{server.isVerified ? 'Verified' : 'Unverified'}
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

				<Button
					disabled={isLoading || !server.baseUrl}
					variant={!server.isVerified ? 'default' : 'outline'}
					onclick={verifyServer}
				>
					{#if isLoading}
						<LoaderCircle class="base-icon animate-spin" />
					{:else}
						{server.isVerified ? $LL.reVerify() : $LL.verify()}
					{/if}
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
