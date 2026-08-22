<script lang="ts">
	import { Coins, ImageIcon, LoaderCircle, Sparkles, Trash2, X } from '@lucide/svelte';
	import { onMount } from 'svelte';
	import { toast } from 'svelte-sonner';

	import LL from '$i18n/i18n-svelte';
	import Button from '$lib/components/Button.svelte';
	import Head from '$lib/components/Head.svelte';
	import MobileMenuBar from '$lib/components/MobileMenuBar.svelte';
	import Modal from '$lib/components/Modal.svelte';
	import ModelSelect from '$lib/components/ModelSelect.svelte';
	import { modelLabel } from '$lib/connections';
	import { downloadName, IMAGE_LIMITS, type GeneratedImage } from '$lib/generatedImages';
	import {
		canDrawImages,
		deleteImage,
		generateImages,
		imageModels,
		imagesEnabled,
		imagesLoaded,
		imagesStore,
		imageUrl,
		serverIdFor
	} from '$lib/images';
	import { serversStore } from '$lib/localStorage';
	import { formatTimestampToNow } from '$lib/utils';

	/**
	 * Everything the app has drawn, and the one field that adds to it.
	 *
	 * Built as a page in the Library family rather than as a conversation: a
	 * gallery is something you come back to and browse, not a thread you are in
	 * the middle of. So it scrolls on its own, it has a heading, and the field
	 * that makes new ones sits at the top where the page starts rather than
	 * floating at the bottom where a composer would.
	 */

	let prompt = $state('');
	let negativePrompt = $state('');
	let model = $state('');
	let size = $state('');
	let count = $state(1);
	let showAdvanced = $state(false);
	let busy = $state(false);
	let opened = $state<GeneratedImage | null>(null);
	let confirmingDelete = $state<string | null>(null);

	/**
	 * The sizes every provider the app draws with accepts.
	 *
	 * A short list rather than a free field: these are enumerated by the provider,
	 * and a size it does not know is a 400 arriving thirty seconds later. Empty
	 * means "whatever the model defaults to", which is the right answer for a
	 * self-hosted model that has its own idea.
	 */
	const SIZES = ['', '1024x1024', '1024x1792', '1792x1024'];

	// The first model that can draw, so the field is never empty on arrival.
	onMount(() => {
		if (!model) model = $imageModels[0]?.name ?? '';
	});

	const serverFor = (id: string) => $serversStore.find((server) => server.id === id);

	async function generate() {
		const serverId = serverIdFor(model);
		if (!serverId || !prompt.trim()) return;

		busy = true;
		try {
			await generateImages({
				serverId,
				model,
				prompt: prompt.trim(),
				negativePrompt: negativePrompt.trim() || undefined,
				size: size || undefined,
				n: count
			});
			// The prompt stays. Drawing is iterative, and the commonest next action is
			// the same words with one of them changed.
		} catch (error) {
			toast.error($LL.imageGenerationFailed(), {
				description: error instanceof Error ? error.message : undefined
			});
		} finally {
			busy = false;
		}
	}

	async function remove(id: string) {
		try {
			await deleteImage(id);
			if (opened?.id === id) opened = null;
		} catch {
			toast.error($LL.imageDeleteFailed());
		} finally {
			confirmingDelete = null;
		}
	}

	/** What one picture cost, when its model was priced. Unpriced says nothing. */
	function costLabel(image: GeneratedImage): string | undefined {
		if (image.cost === undefined) return undefined;
		// Four decimals: a picture that costs a third of a centime should not read
		// as free, which is what two decimals would make of it.
		return `${image.cost.toFixed(4)} ${image.currency ?? 'USD'}`;
	}
</script>

<Head title={$LL.images()} />

<!-- Frameless like the library and the sessions landing, and carrying a surface
     for the same reason. -->
<div
	class="app-panel [--surface-color:var(--color-shade-1)] lg:[--surface-color:var(--color-shade-2)] flex h-full flex-col surface-pane lg:rounded-xl"
>
	<div class="min-h-0 flex-1 overflow-auto">
		<MobileMenuBar />
		<div class="mx-auto w-full max-w-5xl px-6 py-8">
			<div class="mb-1 flex items-center justify-between gap-3">
				<h1 class="truncate text-xl font-semibold tracking-tight text-active">{$LL.images()}</h1>
				{#if $imagesStore.length}
					<span class="shrink-0 text-xs tabular-nums text-muted">
						{$LL.imagesCount({ count: $imagesStore.length })}
					</span>
				{/if}
			</div>
			<p class="mb-7 text-sm text-muted">{$LL.imagesSubtitle()}</p>

			{#if !$imagesEnabled && $imagesLoaded}
				<!-- The instance has not turned this on. Said once, plainly, rather than
				     drawn as a disabled form nobody can use. -->
				<p
					class="rounded-xl border border-dashed border-shade-4 p-6 text-center text-sm text-muted"
				>
					{$LL.imagesDisabled()}
				</p>
			{:else if !$imageModels.length && $imagesLoaded}
				<p
					class="rounded-xl border border-dashed border-shade-4 p-6 text-center text-sm text-muted"
				>
					{$LL.imagesNoModel()}
				</p>
			{:else if $canDrawImages}
				<!-- What makes a new one. At the top because that is where the page
				     starts, and because everything below it is the result. -->
				<div class="mb-8 flex flex-col gap-3 rounded-xl border border-shade-3 bg-shade-0 p-4">
					<textarea
						bind:value={prompt}
						rows="3"
						maxlength={IMAGE_LIMITS.prompt}
						placeholder={$LL.imagePromptPlaceholder()}
						class="w-full resize-y rounded-lg border border-shade-3 bg-shade-1 p-3 text-sm outline-none placeholder:text-muted focus:border-accent"
					></textarea>

					<div class="flex flex-wrap items-center gap-2">
						<div class="min-w-48 flex-1">
							<ModelSelect bind:value={model} kinds={['image']} />
						</div>

						<select
							bind:value={size}
							aria-label={$LL.imageSize()}
							class="h-10 shrink-0 rounded-lg border border-shade-3 bg-shade-0 px-2 text-sm text-active outline-none focus:border-accent"
						>
							{#each SIZES as value (value)}
								<option {value}>{value || $LL.imageSizeDefault()}</option>
							{/each}
						</select>

						<select
							bind:value={count}
							aria-label={$LL.imageCount()}
							class="h-10 shrink-0 rounded-lg border border-shade-3 bg-shade-0 px-2 text-sm text-active outline-none focus:border-accent"
						>
							{#each Array.from({ length: IMAGE_LIMITS.maxPerRequest }, (_, i) => i + 1) as n (n)}
								<option value={n}>{$LL.imageCountOption({ count: n })}</option>
							{/each}
						</select>

						<Button onclick={generate} disabled={busy || !prompt.trim() || !model}>
							{#if busy}
								<LoaderCircle class="h-4 w-4 animate-spin" />
							{:else}
								<Sparkles class="h-4 w-4" />
							{/if}
							{$LL.imageGenerate()}
						</Button>
					</div>

					<button
						type="button"
						onclick={() => (showAdvanced = !showAdvanced)}
						class="self-start text-xs text-link"
					>
						{$LL.advancedSettings()}
					</button>

					{#if showAdvanced}
						<label class="flex flex-col gap-1.5">
							<span class="text-xs font-medium text-active">{$LL.imageNegativePrompt()}</span>
							<input
								bind:value={negativePrompt}
								maxlength={IMAGE_LIMITS.negativePrompt}
								placeholder={$LL.imageNegativePromptPlaceholder()}
								class="settings-field text-sm"
							/>
							<span class="text-xs leading-snug text-muted">
								{$LL.imageNegativePromptHelp()}
							</span>
						</label>
					{/if}

					{#if busy}
						<!-- Said plainly, because it is true and because thirty seconds of
						     nothing reads as a broken button. The reassurance is the useful
						     half: the answer is kept whatever this tab does next. -->
						<p class="text-xs text-muted">{$LL.imageGeneratingHint()}</p>
					{/if}
				</div>
			{/if}

			<!-- The gallery. Newest first, because the one you just made is the one you
			     want to look at. -->
			{#if $imagesStore.length}
				<div class="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3">
					{#each $imagesStore as image (image.id)}
						<button
							type="button"
							onclick={() => (opened = image)}
							class="group relative aspect-square overflow-hidden rounded-xl border border-shade-3 bg-shade-1 transition-colors hover:border-shade-4"
						>
							<img
								src={imageUrl(image.id)}
								alt={image.prompt}
								loading="lazy"
								class="h-full w-full object-cover"
							/>
							<!-- The prompt, on the picture, on hover. A grid of pictures with no
							     words is a grid you have to open one by one to search. -->
							<span
								class="pointer-events-none absolute inset-x-0 bottom-0 line-clamp-2 bg-gradient-to-t from-black/80 to-transparent p-2 text-left text-[11px] text-white opacity-0 transition-opacity group-hover:opacity-100"
							>
								{image.prompt}
							</span>
						</button>
					{/each}
				</div>
			{:else if $imagesLoaded && $canDrawImages}
				<p
					class="rounded-xl border border-dashed border-shade-4 p-10 text-center text-sm text-muted"
				>
					<ImageIcon class="mx-auto mb-2 h-6 w-6 opacity-60" />
					{$LL.imagesEmpty()}
				</p>
			{/if}
		</div>
	</div>
</div>

<!-- One picture, big, with everything that was true about it when it was made. -->
<Modal open={!!opened} closeButton={false}>
	{#if opened}
		{@const image = opened}
		<div class="flex max-h-[85vh] w-full flex-col">
			<div class="flex items-center justify-between gap-2 border-b border-shade-2 px-4 py-3">
				<span class="truncate text-sm font-medium text-active">{image.model}</span>
				<button
					type="button"
					onclick={() => (opened = null)}
					aria-label={$LL.close()}
					class="shrink-0 rounded-md p-1.5 text-muted transition-colors hover:bg-shade-2 hover:text-active"
				>
					<X class="h-4 w-4" />
				</button>
			</div>

			<div class="min-h-0 flex-1 overflow-auto">
				<img
					src={imageUrl(image.id)}
					alt={image.prompt}
					class="max-h-[55vh] w-full bg-shade-1 object-contain"
				/>

				<div class="flex flex-col gap-3 p-4">
					<p class="whitespace-pre-wrap text-sm text-active">{image.prompt}</p>
					{#if image.negativePrompt}
						<p class="text-xs text-muted">
							{$LL.imageNegativePrompt()} · {image.negativePrompt}
						</p>
					{/if}

					<div class="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
						<span>{modelLabel(serverFor(image.serverId), image.model)}</span>
						{#if image.size}<span>{image.size}</span>{/if}
						<span>{formatTimestampToNow(image.createdAt)}</span>
						{#if image.seconds}<span>{image.seconds.toFixed(1)}s</span>{/if}
						{#if costLabel(image)}
							<span class="flex items-center gap-1 tabular-nums">
								<Coins class="h-3 w-3" />
								{costLabel(image)}
							</span>
						{/if}
					</div>
				</div>
			</div>

			<div class="flex flex-wrap items-center gap-2 border-t border-shade-2 px-4 py-3">
				<Button variant="outline" onclick={() => (prompt = image.prompt)}>
					{$LL.imageReusePrompt()}
				</Button>
				<!-- A plain link to the same authenticated route the grid reads. The
				     download attribute only names the file; the session is what allows
				     it, exactly as for the picture already on screen. -->
				<Button variant="outline" href={imageUrl(image.id)} download={downloadName(image)}>
					{$LL.download()}
				</Button>

				<div class="ml-auto flex items-center gap-2">
					{#if confirmingDelete === image.id}
						<span class="text-xs text-negative">{$LL.confirmDeletion()}</span>
						<Button variant="outline" onclick={() => (confirmingDelete = null)}>
							{$LL.cancel()}
						</Button>
						<button
							type="button"
							onclick={() => remove(image.id)}
							class="rounded-md bg-negative px-3 py-2 text-sm font-medium text-shade-0"
						>
							{$LL.delete()}
						</button>
					{:else}
						<Button variant="outline" onclick={() => (confirmingDelete = image.id)}>
							<Trash2 class="h-4 w-4" />
							{$LL.delete()}
						</Button>
					{/if}
				</div>
			</div>
		</div>
	{/if}
</Modal>
