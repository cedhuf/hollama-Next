<script lang="ts">
	import {
		ArrowDownToLine,
		ChevronDown,
		Coins,
		FileArchive,
		ImageIcon,
		LoaderCircle,
		RotateCcw,
		SlidersHorizontal,
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
	import Menu from '$lib/components/Menu.svelte';
	import MenuItem from '$lib/components/MenuItem.svelte';
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
	/** Whether the open picture's prompt is shown whole. Reset with each picture. */
	let expandedPrompt = $state(false);
	/** The prompt block's natural height, measured so the opening can be animated. */
	let promptHeight = $state(0);
	/**
	 * The prompt paragraph's own height, apart from everything under it.
	 *
	 * Two measurements rather than one because the collapsed height has to land on
	 * a line boundary *and* never cut into the next paragraph. A single fixed
	 * number does neither: it slices a line in half when the text is long, and
	 * shows the tops of the letters below when the prompt is short.
	 */
	let promptOnlyHeight = $state(0);
	/** One line of the prompt, at the leading the paragraph is given below. */
	const PROMPT_LINE = 20;
	/**
	 * How much shows when it is closed: two whole lines, or the whole prompt when
	 * it is shorter than that. Exact either way, so nothing is ever half a letter.
	 */
	const collapsedHeight = $derived(Math.min(promptOnlyHeight, PROMPT_LINE * 2));
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

	/**
	 * Whether to offer the rewriter: switched on, and with a model to run it —
	 * its own, or failing that the one this account uses for everything else.
	 */
	const canRewrite = $derived(
		$chatDefaultsConfig.images.imagePromptWriter &&
			!!($chatDefaultsConfig.images.imagePromptModel || $chatDefaultsConfig.defaultModel.value)
	);

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

	/**
	 * Hand a file to the browser.
	 *
	 * An anchor rather than a navigation, because the picture route serves its
	 * bytes `inline` — going to it would show the image instead of saving it, and
	 * `download` is what says which of the two is meant. Both routes are
	 * same-origin and behind the same session as the page itself.
	 */
	function saveAs(url: string, name?: string) {
		const link = document.createElement('a');
		link.href = url;
		if (name) link.download = name;
		document.body.appendChild(link);
		link.click();
		link.remove();
	}

	/** The newest one, which is almost always the one just made. */
	function exportLatest() {
		const latest = $imagesStore[0];
		if (latest) saveAs(imageUrl(latest.id), downloadName(latest));
	}

	/**
	 * Everything, as one archive built and streamed by the server.
	 *
	 * Not a loop of downloads: browsers block the second and third of those, and
	 * an account may hold hundreds. The archive carries a manifest of the prompts
	 * beside the pictures, which is the half that cannot be recovered from the
	 * files themselves.
	 */
	function exportAll() {
		saveAs('/api/images/export');
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
			<!-- Same header as the library's, down to the height of the row: its right
			     side carries a button, which makes that row taller than a line of text,
			     and without the same floor here the two titles sit at different heights
			     and moving between the pages reads as a jump. -->
			<div class="mb-1 flex min-h-9 items-center justify-between gap-3">
				<h1 class="truncate text-xl font-semibold tracking-tight text-active">{$LL.images()}</h1>

				{#if $imagesStore.length}
					<div class="flex shrink-0 items-center gap-2">
						<!-- How many, next to the thing that acts on them rather than next to
						     the title: it is the size of what you are about to export. -->
						<span class="text-xs tabular-nums text-muted">
							{$LL.imagesCount({ count: $imagesStore.length })}
						</span>

						<Menu>
							{#snippet trigger({ props })}
								<button
									{...props}
									type="button"
									class="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-shade-0 transition-opacity hover:opacity-90"
								>
									<ArrowDownToLine class="h-4 w-4" />
									{$LL.export()}
								</button>
							{/snippet}

							<MenuItem icon={ImageIcon} onclick={exportLatest}>
								{$LL.imagesExportLast()}
							</MenuItem>
							<MenuItem icon={FileArchive} onclick={exportAll}>
								{$LL.imagesExportAll({ count: $imagesStore.length })}
							</MenuItem>
						</Menu>
					</div>
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
				<!-- What makes a new one. At the top because that is where the page starts,
				     and because everything below it is the result.

				     Built as one surface rather than a stack of form rows: the words, the
				     controls that qualify them and the button that acts on them are one
				     gesture, so they share a frame and the field inside it has no border of
				     its own. Same idea as the composer in a conversation, in the shape this
				     page needs. -->
				<div
					class="library-section mb-8 overflow-hidden rounded-2xl border bg-shade-0 shadow-sm transition-colors focus-within:border-accent section-tint"
					style="--section-turn: 40"
				>
					<textarea
						bind:value={prompt}
						rows="3"
						maxlength={IMAGE_LIMITS.prompt}
						placeholder={$LL.imagePromptPlaceholder()}
						class="w-full resize-none border-0 bg-transparent px-4 pb-2 pt-4 text-base leading-relaxed outline-none placeholder:text-muted"
					></textarea>

					{#if canRewrite && rewritten}
						<!-- Shown, not applied. What is in this box is what gets sent; empty it
						     and the words above are sent instead. Tinted with the accent so it
						     reads as something the app added rather than something you typed. -->
						<div class="mx-4 mb-3 flex flex-col gap-1.5 rounded-xl bg-accent/[0.07] p-3">
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
								class="w-full resize-none rounded-lg border border-shade-3 bg-shade-0 p-2 text-sm leading-relaxed outline-none focus:border-accent"
							></textarea>
							<span class="text-xs leading-snug text-muted">{$LL.imageRewrittenHint()}</span>
						</div>
					{/if}

					{#if showAdvanced}
						<div class="mx-4 mb-3 flex flex-col gap-1.5">
							<input
								bind:value={negativePrompt}
								maxlength={IMAGE_LIMITS.negativePrompt}
								placeholder={$LL.imageNegativePromptPlaceholder()}
								aria-label={$LL.imageNegativePrompt()}
								class="w-full rounded-lg border border-shade-3 bg-shade-1 px-3 py-2 text-sm outline-none placeholder:text-muted focus:border-accent"
							/>
							<span class="text-xs leading-snug text-muted">{$LL.imageNegativePromptHelp()}</span>
						</div>
					{/if}

					<!-- The controls, on their own strip at the foot of the surface. A hairline
					     rather than a second card: they qualify the words above, they are not a
					     separate subject. -->
					<div
						class="flex flex-wrap items-center gap-2 border-t border-shade-2 bg-shade-1/60 px-3 py-2.5"
					>
						<div class="min-w-40 flex-1">
							<ModelSelect bind:value={model} kinds={['image']} />
						</div>

						<select
							bind:value={size}
							aria-label={$LL.imageSize()}
							class="h-9 shrink-0 rounded-lg border border-shade-3 bg-shade-0 px-2 text-xs text-muted outline-none transition-colors hover:text-active focus:border-accent"
						>
							{#each SIZES as value (value)}
								<option {value}>{value || $LL.imageSizeDefault()}</option>
							{/each}
						</select>

						<select
							bind:value={count}
							aria-label={$LL.imageCount()}
							class="h-9 shrink-0 rounded-lg border border-shade-3 bg-shade-0 px-2 text-xs text-muted outline-none transition-colors hover:text-active focus:border-accent"
						>
							{#each Array.from({ length: IMAGE_LIMITS.maxPerRequest }, (_, i) => i + 1) as n (n)}
								<option value={n}>{$LL.imageCountOption({ count: n })}</option>
							{/each}
						</select>

						<!-- The rarely-used half, as an icon that toggles rather than a link that
						     reads like a page. It shows it is on by staying lit. -->
						<button
							type="button"
							onclick={() => (showAdvanced = !showAdvanced)}
							aria-expanded={showAdvanced}
							aria-label={$LL.advancedSettings()}
							title={$LL.imageNegativePrompt()}
							class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border transition-colors {showAdvanced
								? 'border-accent/50 bg-accent/10 text-accent'
								: 'border-shade-3 text-muted hover:text-active'}"
						>
							<SlidersHorizontal class="h-3.5 w-3.5" />
						</button>

						<div class="ml-auto flex items-center gap-2">
							{#if canRewrite}
								<button
									type="button"
									onclick={rewrite}
									disabled={rewriting || busy || !prompt.trim()}
									title={$LL.imageRewrite()}
									class="flex h-9 items-center gap-1.5 rounded-lg border border-shade-3 px-2.5 text-xs text-muted transition-colors hover:text-active disabled:pointer-events-none disabled:opacity-50"
								>
									{#if rewriting}
										<LoaderCircle class="h-3.5 w-3.5 animate-spin" />
									{:else}
										<Wand2 class="h-3.5 w-3.5" />
									{/if}
									<span class="max-sm:hidden">{$LL.imageRewrite()}</span>
								</button>
							{/if}

							<button
								type="button"
								onclick={generate}
								disabled={busy || !prompt.trim() || !model}
								class="flex h-9 items-center gap-1.5 rounded-lg bg-accent px-3 text-xs font-medium text-shade-0 transition-opacity hover:opacity-90 disabled:pointer-events-none disabled:bg-shade-3 disabled:text-muted"
							>
								{#if busy}
									<LoaderCircle class="h-3.5 w-3.5 animate-spin" />
								{:else}
									<Sparkles class="h-3.5 w-3.5" />
								{/if}
								{$LL.imageGenerate()}
							</button>
						</div>
					</div>
				</div>
			{/if}

			<!-- The gallery. Newest first, because the one you just made is the one you
			     want to look at. -->
			{#if $imagesStore.length || busy}
				<div class="grid grid-cols-[repeat(auto-fill,minmax(190px,1fr))] gap-3">
					{#if busy}
						<!-- One placeholder per picture asked for, at the front, where the
						     pictures will be. Thirty seconds of a spinner somewhere else reads
						     as a page that has stopped; thirty seconds of the shapes filling in
						     reads as a page that is working, and it says how many are coming. -->
						{#each Array.from({ length: count }, (_, i) => i) as slot (slot)}
							<div
								class="flex aspect-square animate-pulse items-center justify-center rounded-xl border border-dashed border-accent/40 bg-accent/5"
								style="animation-delay: {slot * 150}ms"
							>
								<ImageIcon class="h-6 w-6 text-accent/40" />
							</div>
						{/each}
					{/if}

					{#each $imagesStore as image (image.id)}
						<button
							type="button"
							onclick={() => {
								opened = image;
								expandedPrompt = false;
							}}
							class="group relative aspect-square overflow-hidden rounded-xl border border-shade-3 bg-shade-1 transition-all hover:border-shade-4 hover:shadow-md focus-visible:border-accent focus-visible:outline-none"
						>
							<!-- The picture grows a little under the pointer inside a frame that
							     does not, which is what makes a grid of squares feel like objects
							     rather than a contact sheet. -->
							<img
								src={imageUrl(image.id)}
								alt={image.prompt}
								loading="lazy"
								class="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.04] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
							/>

							<!-- Which connection drew it, in the colour that connection wears
							     everywhere else in the app. A gallery mixing two providers reads
							     without a legend. -->
							<span
								class="absolute left-2 top-2 h-2 w-2 rounded-full ring-1 ring-black/20"
								style="background-color: {badgeColor(image.serverId)}"
							></span>

							<!-- The prompt, on the picture, on hover and on keyboard focus. A grid
							     of pictures with no words is a grid you open one by one to search.
							     Focus counts as hover here, or the keyboard never sees it. -->
							<span
								class="pointer-events-none absolute inset-x-0 bottom-0 line-clamp-2 bg-gradient-to-t from-black/85 via-black/50 to-transparent px-2.5 pb-2.5 pt-6 text-left text-[11px] leading-snug text-white opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-visible:opacity-100"
							>
								{image.prompt}
							</span>
						</button>
					{/each}
				</div>
			{:else if $imagesLoaded && $canDrawImages}
				<!-- Empty, and saying so as an invitation rather than as a fault. -->
				<div
					class="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-shade-4 px-6 py-14 text-center"
				>
					<div class="flex h-12 w-12 items-center justify-center rounded-full bg-accent/10">
						<ImageIcon class="h-5 w-5 text-accent" />
					</div>
					<p class="max-w-sm text-sm text-muted">{$LL.imagesEmpty()}</p>
				</div>
			{/if}
		</div>
	</div>
</div>

<!-- One picture, as big as the dialog will allow.

     Bound in both directions, and it has to be: the dialog closes on Escape and
     on a click outside as well as on its own button, and those two routes are the
     dialog's own business. Handed a plain expression it shut itself while
     `opened` stayed full, and since the expression never changed value nothing
     could open it again — every later click set a different picture behind a
     dialog that had already decided it was closed.

     A pair of functions rather than a plain `bind:`, because what the dialog
     holds is a boolean and what this page holds is a picture. Closing clears the
     picture, which is the same thing said in the page's own terms. -->
<Modal
	bind:open={
		() => !!opened,
		(isOpen) => {
			if (!isOpen) opened = null;
		}
	}
	closeButton={false}
>
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

			<!-- Nothing here scrolls. A long prompt is clamped to two lines, and opening
			     it takes its room from the picture — which shrinks, because it is the
			     flexible one. A scrollbar inside a strip this short is a control nobody
			     sees and everybody fights. -->
			<div class="shrink-0 border-t border-shade-2 px-4 py-3">
				<!-- A clamp cannot be animated: `line-clamp` has no in-between, so opening
				     one is a jump whatever easing is asked for. A height can be animated, but
				     only towards a number, and the number is whatever this text happens to
				     be — so it is measured. The inner box keeps its natural height because
				     the clipping is done by its parent, which is what makes the measurement
				     available even while it is hidden. -->
				<div
					class="overflow-hidden transition-[max-height] duration-300 ease-out motion-reduce:transition-none"
					style="max-height: {expandedPrompt ? promptHeight : collapsedHeight}px"
				>
					<div bind:clientHeight={promptHeight}>
						<!-- An explicit leading, because the collapsed height is a multiple of
						     it. Left to the default it is a fraction nobody can divide by. -->
						<p
							bind:clientHeight={promptOnlyHeight}
							class="whitespace-pre-wrap text-sm leading-5 text-active"
						>
							{image.prompt}
						</p>
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
					</div>
				</div>

				<!-- Offered only when there is something to open. A prompt of six words with
				     a "show more" under it is a control that does nothing. -->
				{#if promptHeight > collapsedHeight}
					<button
						type="button"
						onclick={() => (expandedPrompt = !expandedPrompt)}
						aria-expanded={expandedPrompt}
						class="mt-1.5 flex items-center gap-1 text-xs text-link"
					>
						<ChevronDown
							class="h-3 w-3 transition-transform duration-300 motion-reduce:transition-none {expandedPrompt
								? 'rotate-180'
								: ''}"
						/>
						{expandedPrompt ? $LL.showLess() : $LL.showMore()}
					</button>
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
