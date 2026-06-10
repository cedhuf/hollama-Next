<script lang="ts">
	import { ChevronDown, ChevronUp, LoaderCircle } from '@lucide/svelte';
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
		infomaniakBaseUrl,
		isOpenAiCompatible
	} from '$lib/connections';
	import { serversStore } from '$lib/localStorage';

	import OllamaBaseURLHelp from './ollama/BaseURLHelp.svelte';
	import PullModel from './ollama/PullModel.svelte';

	interface Props {
		index: number;
	}

	let { index }: Props = $props();
	let server = $derived($serversStore[index]);
	let strategy: OllamaStrategy | OpenAIStrategy;
	let isLoading = $state(false);
	let showAdvanced = $state(false);

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

	$effect(() => {
		serversStore.update((servers) => {
			servers.splice(index, 1, server);
			return servers;
		});
	});

	// Infomaniak's endpoint is fully determined by the product ID (API v2).
	// Guard the write so the effect doesn't read and write the same state in a loop.
	$effect(() => {
		if (isInfomaniak) {
			const url = infomaniakBaseUrl(server.productId ?? '');
			if (server.baseUrl !== url) server.baseUrl = url;
		}
	});

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
		isLoading = false;
	}

	function deleteServer() {
		serversStore.update((servers) => servers.filter((s) => s.id !== server.id));
	}
</script>

<div data-testid="server">
	<Fieldset>
		{#snippet legend()}
			{#if badgeVariant}
				<Badge variant={badgeVariant} />
			{/if}
			<Badge>{server.label ? server.label : provider.name}</Badge>
		{/snippet}

		<Fieldset>
			<nav class="flex items-stretch gap-x-2">
				<FieldCheckbox label={$LL.useModelsFromThisServer()} bind:checked={server.isEnabled} />

				<Button
					class="max-h-full"
					variant="outline"
					on:click={deleteServer}
					aria-label={$LL.deleteServer()}
				>
					<Trash_2 class="base-icon" />
				</Button>

				<Button
					disabled={isLoading || !server.baseUrl}
					variant={!server.isVerified ? 'default' : 'outline'}
					on:click={verifyServer}
				>
					{#if isLoading}
						<LoaderCircle class="base-icon animate-spin" />
					{:else}
						{server.isVerified ? $LL.reVerify() : $LL.verify()}
					{/if}
				</Button>
			</nav>

			<div class="flex flex-col gap-2 sm:grid sm:grid-cols-2">
				<!-- Primary credential fields -->
				<div class="col-span-2 grid gap-2 sm:grid-cols-2">
					{#if isInfomaniak}
						<FieldInput
							name={`productId-${server.id}`}
							label={$LL.productId()}
							placeholder="1234"
							bind:value={server.productId}
						/>
					{/if}

					{#if isOpenAiFamily}
						<FieldInput
							type="password"
							name={`apiKey-${server.id}`}
							label={$LL.apiKey()}
							bind:value={server.apiKey}
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
						>
							<svelte:fragment slot="help">
								{#if isOllamaFamily}
									<OllamaBaseURLHelp {server} />
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
						disabled={isInfomaniak}
						placeholder={server.baseUrl}
						bind:value={server.baseUrl}
					/>
				{/if}
			{/if}

			{#if isOllamaFamily}
				<PullModel {server} />
			{/if}
		</Fieldset>
	</Fieldset>
</div>
