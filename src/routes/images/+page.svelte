<script lang="ts">
	import {
		ArrowDownToLine,
		Coins,
		ImageIcon,
		LoaderCircle,
		RotateCcw,
		Sparkles,
		Trash2,
		Wand2,
		X
	} from '@lucide/svelte';
	import { onMount } from 'svelte';
	import { toast } from 'svelte-sonner';

	import LL from '$i18n/i18n-svelte';
	import { chatDefaultsConfig } from '$lib/chatDefaults';
	import Button from '$lib/components/Button.svelte';
	import Head from '$lib/components/Head.svelte';
	import MobileMenuBar from '$lib/components/MobileMenuBar.svelte';
	import Modal from '$lib/components/Modal.svelte';
	import ModelSelect from '$lib/components/ModelSelect.svelte';
	import { modelLabel, serverBadge } from '$lib/connections';
	import { downloadName, IMAGE_LIMITS, type GeneratedImage } from '$lib/generatedImages';
	import { writeImagePrompt } from '$lib/imagePrompt';
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
	/**
	 * What the writer produced, waiting to be read.
	 *
	 * A field of its own rather than a replacement for what was typed. The person
	 * keeps their words, sees what would be sent instead, and can edit or discard
	 * it. A helper that silently overwrote the box would be one nobody could tell
	 * apart from a bug the first time it made the picture worse.
	 */
	let rewritten = $state('');
	let rewriting = $state(false);
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

	/** Whether the rewriter is configured at all, here or by the administrator. */
	const canRewrite = $derived(!!$chatDefaultsConfig.images.imagePromptModel);

	// The instance's or the account's default, and failing both the first model
	// that can draw — so the field is never empty on arrival.
	onMount(() => {
		if (model) return;
		const preferred = $chatDefaultsConfig.images.defaultImageModel;
		model =
			($imageModels.some((m) => m.name === preferred) ? preferred : $imageModels[0]?.name) ?? '';
	});

	async function rewrite() {
		if (!prompt.trim()) return;
		rewriting = true;
		try {
			const text = await writeImagePrompt(prompt);
			if (text) rewritten = text;
			else toast.error($LL.imageRewriteFailed());
		} catch (error) {
			toast.error($LL.imageRewriteFailed(), {
				description: error instanceof Error ? error.message : undefined
			});
		} finally {
			rewriting = false;
		}
	}

	const serverFor = (id: string) => $serversStore.find((server) => server.id === id);

	/**
	 * The connection's accent, which is the app's way of saying where something
	 * came from. The same dot appears beside every model everywhere else, so a
	 * gallery mixing two providers reads without a legend.
	 */
	function badgeColor(serverId: string): string {
		const server = serverFor(serverId);
		return server ? serverBadge(server).color : '#888780';
	}

	async function generate() {
		const serverId = serverIdFor(model);
		if (!serverId || !prompt.trim()) return;

		busy = true;
		try {
			await generateImages({
				serverId,
				model,
				// Both, always. The words that were typed are what the gallery shows and
				// what a search would match; the rewrite is what was actually sent, and
				// keeping it is what makes "why does this not look like what I asked
				// for" a question with an answer.
				prompt: prompt.trim(),
				sentPrompt: rewritten.trim() || undefined,
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

	/**
	 * Set the field back to how this picture was made.
	 *
	 * The prompt and everything beside it, because reusing a prompt without the
	 * model, size and negative prompt that produced the result is reusing a third
	 * of it, and the difference shows in the next image rather than in the form.
	 */
	function reuse(image: GeneratedImage) {
		prompt = image.prompt;
		rewritten = image.sentPrompt ?? '';
		negativePrompt = image.negativePrompt ?? '';
		if (image.size) size = image.size;
		if ($imageModels.some((m) => m.name === image.model)) model = image.model;
		if (image.negativePrompt) showAdvanced = true;
		opened = null;
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

					{#if canRewrite && rewritten}
						<!-- Shown, not applied. What is in this box is what gets sent; empty
						     it and the words above are sent instead. -->
						<div class="flex flex-col gap-1.5 rounded-lg border border-accent/40 bg-accent/5 p-3">
							<div class="flex items-center gap-2">
								<Wand2 class="h-3.5 w-3.5 shrink-0 text-accent" />
								<span class="text-xs font-medium text-active">{$LL.imageRewritten()}</span>
								<button
									type="button"
									onclick={() => (rewritten = '')}
									class="ml-auto text-xs text-link"
								>
									{$LL.imageUseOriginal()}
								</button>
							</div>
							<textarea
								bind:value={rewritten}
								rows="3"
								maxlength={IMAGE_LIMITS.prompt}
								class="w-full resize-y rounded-md border border-shade-3 bg-shade-0 p-2 text-sm outline-none focus:border-accent"
							></textarea>
							<span class="text-xs leading-snug text-muted">{$LL.imageRewrittenHint()}</span>
						</div>
					{/if}

					<div class="flex flex-wrap items-center gap-2">
						<div class="min-w-48 flex-1">
							<ModelSelect bind:value={model} kinds={['image']} />
						</div>

						{#if canRewrite}
							<Button
								variant="outline"
								onclick={rewrite}
								disabled={rewriting || busy || !prompt.trim()}
								title={$LL.imageRewrite()}
							>
								{#if rewriting}
									<LoaderCircle class="h-4 w-4 animate-spin" />
								{:else}
									<Wand2 class="h-4 w-4" />
								{/if}
								{$LL.imageRewrite()}
							</Button>
						{/if}

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

<!-- One picture, as big as the dialog will allow. -->
<Modal open={!!opened} closeButton={false}>
	{#if opened}
		{@const image = opened}
		<!-- The dialog is a fixed box, so this fills it and divides it rather than
		     growing past it. Header, footer and the strip of facts hold their own
		     height; everything left over is the picture's, and the picture scales to
		     it. That is what stops a large image from turning a dialog into a page
		     you scroll to see the middle of. -->
		<div class="flex h-full w-full flex-col">
			<div class="flex shrink-0 items-center gap-2 border-b border-shade-2 px-4 py-3">
				<span
					class="inline-block h-2 w-2 shrink-0 rounded-full"
					style="background-color: {badgeColor(image.serverId)}"
				></span>
				<span class="truncate text-sm font-medium text-active">
					{modelLabel(serverFor(image.serverId), image.model)}
				</span>
				<button
					type="button"
					onclick={() => (opened = null)}
					aria-label={$LL.close()}
					class="ml-auto shrink-0 rounded-md p-1.5 text-muted transition-colors hover:bg-shade-2 hover:text-active"
				>
					<X class="h-4 w-4" />
				</button>
			</div>

			<!-- `min-h-0` is what makes the rest of this work: without it a flex child
			     refuses to shrink below its content, so the image would push the footer
			     off the bottom instead of fitting between them. -->
			<div class="flex min-h-0 flex-1 items-center justify-center bg-shade-1 p-3">
				<img
					src={imageUrl(image.id)}
					alt={image.prompt}
					class="max-h-full max-w-full rounded-lg object-contain shadow-sm"
				/>
			</div>

			<!-- Capped and scrollable on its own, so a long prompt takes room from
			     itself rather than from the picture. -->
			<div class="max-h-28 shrink-0 overflow-auto border-t border-shade-2 px-4 py-3">
				<p class="whitespace-pre-wrap text-sm text-active">{image.prompt}</p>
				{#if image.sentPrompt}
					<!-- What was actually sent, when the writer had a go at it. Kept beside
					     the original rather than instead of it. -->
					<p class="mt-1 whitespace-pre-wrap text-xs text-muted">
						<Wand2 class="mr-1 inline h-3 w-3" />{image.sentPrompt}
					</p>
				{/if}
				{#if image.negativePrompt}
					<p class="mt-1 text-xs text-muted">
						{$LL.imageNegativePrompt()} · {image.negativePrompt}
					</p>
				{/if}
				<div class="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
					{#if image.size}<span class="tabular-nums">{image.size}</span>{/if}
					<span>{formatTimestampToNow(image.createdAt)}</span>
					{#if image.seconds}<span class="tabular-nums">{image.seconds.toFixed(1)}s</span>{/if}
					{#if costLabel(image)}
						<span class="flex items-center gap-1 tabular-nums">
							<Coins class="h-3 w-3" />
							{costLabel(image)}
						</span>
					{/if}
				</div>
			</div>

			<div class="flex shrink-0 flex-wrap items-center gap-2 border-t border-shade-2 px-4 py-3">
				<Button variant="outline" onclick={() => reuse(image)}>
					<RotateCcw class="h-4 w-4" />
					{$LL.imageReusePrompt()}
				</Button>
				<!-- A plain link to the same authenticated route the grid reads. The
				     download attribute only names the file; the session is what allows
				     it, exactly as for the picture already on screen. -->
				<Button variant="outline" href={imageUrl(image.id)} download={downloadName(image)}>
					<ArrowDownToLine class="h-4 w-4" />
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
