<script lang="ts">
	import { CloudDownload } from '@lucide/svelte';
	import type { ErrorResponse, ProgressResponse, StatusResponse } from 'ollama/browser';
	import { toast } from 'svelte-sonner';

	import LL from '$i18n/i18n-svelte';
	import { OllamaStrategy } from '$lib/chat/ollama';
	import Button from '$lib/components/Button.svelte';
	import type { Server } from '$lib/connections';

	import SettingsField from '../SettingsField.svelte';

	interface Props {
		server: Server;
	}

	let { server }: Props = $props();
	let modelTag: string | undefined = $state();
	let isPullInProgress = $state(false);

	const strategy = $derived(new OllamaStrategy(server));

	async function pullModel() {
		if (!modelTag) return;
		isPullInProgress = true;
		const toastId = toast.loading($LL.pullingModel(), { description: modelTag });

		try {
			await strategy.pull(
				{ model: modelTag, stream: true },
				(response: ProgressResponse | StatusResponse | ErrorResponse) => {
					if ('status' in response && response.status === 'success') {
						toast.success($LL.success(), {
							id: toastId,
							// HACK: `modelTag` is inferred as `string | undefined`
							// but it should be a `string` based on the guard clause above
							description: $LL.modelWasDownloaded({ model: modelTag as string })
						});
						modelTag = '';
						return;
					}

					if ('error' in response) {
						toast.error($LL.genericError(), { id: toastId, description: response.error });
						return;
					}

					if ('completed' in response && 'total' in response) {
						const progress = (response.completed / response.total) * 100;
						toast.loading(response.status, {
							id: toastId,
							description: `${progress.toFixed(0)}%`
						});
					}
				}
			);
			await strategy.getModels();
		} catch (error) {
			const typedError = error instanceof Error ? error : new Error(String(error));

			toast.error($LL.genericError(), {
				id: toastId,
				description:
					typedError.message === 'Failed to fetch'
						? $LL.couldntConnectToOllamaServer()
						: typedError.message
			});
		}
		isPullInProgress = false;
	}
</script>

<SettingsField label={$LL.pullModel()}>
	<div class="flex items-center gap-2">
		<input
			class="settings-field"
			id={`pull-model-${server.id}`}
			placeholder={$LL.pullModelPlaceholder()}
			bind:value={modelTag}
			disabled={isPullInProgress || !server.isVerified}
		/>
		<Button
			variant="outline"
			aria-label={$LL.downloadModel()}
			class="shrink-0"
			isLoading={isPullInProgress}
			disabled={!modelTag || isPullInProgress || !server.isVerified}
			onclick={pullModel}
		>
			<CloudDownload class="base-icon" />
		</Button>
	</div>
</SettingsField>

<p class="text-muted -mt-2 text-xs leading-snug">
	{$LL.browseModels()}
	<Button href="https://ollama.com/library" variant="link" target="_blank">
		{$LL.ollamaLibrary()}
	</Button>
</p>
