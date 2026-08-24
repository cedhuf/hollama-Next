<script lang="ts">
	import {
		ArrowDownToLine,
		Ban,
		ChevronDown,
		Coins,
		Eraser,
		FileArchive,
		ImageIcon,
		LoaderCircle,
		Paperclip,
		RotateCcw,
		Sparkles,
		Trash2,
		Wand2,
		X
	} from '@lucide/svelte';
	import { onMount, untrack } from 'svelte';
	import { cubicOut } from 'svelte/easing';
	import { fade, slide } from 'svelte/transition';

	import LL from '$i18n/i18n-svelte';
	import { chatDefaultsConfig } from '$lib/chatDefaults';
	import Head from '$lib/components/Head.svelte';
	import ImageDrop from '$lib/components/ImageDrop.svelte';
	import Menu from '$lib/components/Menu.svelte';
	import MenuItem from '$lib/components/MenuItem.svelte';
	import MobileMenuBar from '$lib/components/MobileMenuBar.svelte';
	import Modal from '$lib/components/Modal.svelte';
	import ModelSelect from '$lib/components/ModelSelect.svelte';
	import Select from '$lib/components/Select.svelte';
	import Tooltip from '$lib/components/Tooltip.svelte';
	import {
		IMAGE_QUALITIES,
		IMAGE_RATIOS,
		imageOptionsFor,
		modelLabel,
		referencesFor,
		serverBadge,
		type ImageQuality,
		type ImageRatio
	} from '$lib/connections';
	import { clearDraft, IMAGE_DRAFT, readDraft, writeDraft } from '$lib/drafts';
	import {
		downloadName,
		hasTrigger,
		IMAGE_LIMITS,
		type GeneratedImage
	} from '$lib/generatedImages';
	import { pickImageFiles, warnRejected } from '$lib/imageFiles';
	import { writeImagePrompt } from '$lib/imagePrompt';
	import {
		canDrawImages,
		deleteImage,
		generateImages,
		imageModels,
		imagesLoaded,
		imagesStore,
		imageUrl,
		serverIdFor,
		titleImages
	} from '$lib/images';
	import { serversStore } from '$lib/localStorage';
	import type { ImageAttachment } from '$lib/promptAttachments';
	import { toast } from '$lib/toast';
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

	let prompt = $state(readDraft(IMAGE_DRAFT));
	let negativePrompt = $state('');
	let model = $state('');
	let ratio = $state<ImageRatio>('square');
	let quality = $state<ImageQuality>('standard');
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
	/** How tall the floating prompt is, so the picture can stop above it. */
	let promptBarHeight = $state(0);
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
	const PROMPT_LINE = 16;
	/**
	 * How much shows when it is closed: one whole line, or the whole prompt when it
	 * is shorter than that. Exact either way, so nothing is ever half a letter.
	 */
	const collapsedHeight = $derived(Math.min(promptOnlyHeight, PROMPT_LINE));
	let confirmingDelete = $state<string | null>(null);

	/**
	 * What this connection understands, for the model currently chosen.
	 *
	 * Empty on anything the app has no translation for, which disables both
	 * controls rather than offering a choice that becomes a refusal thirty seconds
	 * later. The request then carries neither field and the model uses its own
	 * default, which is valid everywhere.
	 */
	const options = $derived.by(() => {
		const server = serverFor(serverIdFor(model) ?? '');
		return server ? imageOptionsFor(server.connectionType, model) : {};
	});

	/**
	 * Pictures to work from, when the model chosen takes any.
	 *
	 * Held here and nowhere else: they travel with one request and are never
	 * stored, so switching to a model that takes none has to put them down rather
	 * than keep them waiting for a model that would.
	 */
	let references = $state<ImageAttachment[]>([]);

	const accepts = $derived.by(() => {
		const server = serverFor(serverIdFor(model) ?? '');
		return server ? referencesFor(server.connectionType, model) : undefined;
	});

	const roomLeft = $derived(accepts ? accepts.max - references.length : 0);

	/**
	 * Whether the words still owe the model its trigger.
	 *
	 * Shown only once there is something to work from, because before that the
	 * sentence is about a rule for pictures nobody has attached. The server refuses
	 * the same case, which is the one that protects the allowance; this is only so
	 * the refusal never has to happen.
	 */
	const missingTrigger = $derived.by(() => {
		const word = accepts?.trigger;
		if (!word || !references.length) return undefined;
		const sent = rewritten.trim() || prompt.trim();
		return hasTrigger(sent, word) ? undefined : word;
	});

	// Dropped rather than carried over, and said out loud: a reference held for a
	// model that cannot use it is a picture you think you attached.
	$effect(() => {
		if (!accepts && references.length) {
			references = [];
			toast.info($LL.imageReferencesDropped());
		}
	});

	function addReferences(images: ImageAttachment[]) {
		if (!accepts) return;
		const room = accepts.max - references.length;
		if (room <= 0) {
			toast.warning($LL.imageReferencesFull({ count: accepts.max }));
			return;
		}
		references = [...references, ...images.slice(0, room)];
		if (images.length > room) toast.warning($LL.imageReferencesFull({ count: accepts.max }));
	}

	/**
	 * Whether there is anything to put down.
	 *
	 * The button is drawn only when the answer is yes. A control that resets an
	 * empty composer is a control that does nothing, and one sitting over the
	 * placeholder is the first thing you see on a page you have not used yet.
	 */
	const composerFilled = $derived(
		!!prompt.trim() || !!rewritten.trim() || !!negativePrompt.trim() || references.length > 0
	);

	/**
	 * Put down everything composed for the next drawing.
	 *
	 * The words, the rewrite, the negative prompt and the pictures brought along:
	 * all of it belongs to the message being written, so a reset that left any of it
	 * behind would be a reset you have to check. What it does not touch is the
	 * model, the shape, the quality and the count, which are how you work rather
	 * than what you are asking for this time.
	 */
	function resetComposer() {
		prompt = '';
		clearDraft(IMAGE_DRAFT);
		rewritten = '';
		negativePrompt = '';
		references = [];
	}

	/**
	 * The words survive a reload; the pictures brought along do not.
	 *
	 * Only the prompt is kept. A reference is measured in megabytes and the whole
	 * of local storage in five, so keeping one would evict the galleries and the
	 * conversations it sits beside. The negative prompt stays out for a smaller
	 * reason: it is behind a toggle, and restoring a field somebody cannot see is
	 * how a request goes out carrying something nobody remembered writing.
	 */
	$effect(() => {
		void prompt;
		untrack(() => writeDraft(IMAGE_DRAFT, prompt));
	});

	async function pickReferences() {
		const { images, rejected } = await pickImageFiles();
		warnRejected(rejected);
		addReferences(images);
	}

	const RATIO_LABELS = $derived<Record<ImageRatio, string>>({
		square: $LL.imageRatioSquare(),
		portrait: $LL.imageRatioPortrait(),
		landscape: $LL.imageRatioLandscape()
	});
	const QUALITY_LABELS = $derived<Record<ImageQuality, string>>({
		low: $LL.imageQualityLow(),
		standard: $LL.imageQualityStandard(),
		high: $LL.imageQualityHigh()
	});

	/**
	 * The three lists on the strip, in the shape the shared picker takes.
	 *
	 * Built here rather than inline so the markup stays one component per control.
	 * The values are strings because that is what a picked option carries; the two
	 * that are really a union and the one that is really a number are converted back
	 * on the way in, which is the only place the conversion belongs.
	 */
	const RATIO_OPTIONS = $derived(
		IMAGE_RATIOS.map((value) => ({ value, label: RATIO_LABELS[value] }))
	);
	const QUALITY_OPTIONS = $derived(
		IMAGE_QUALITIES.map((value) => ({ value, label: QUALITY_LABELS[value] }))
	);
	const COUNT_OPTIONS = $derived(
		Array.from({ length: IMAGE_LIMITS.maxPerRequest }, (_, i) => ({
			value: String(i + 1),
			label: $LL.imageCountOption({ count: i + 1 })
		}))
	);

	/**
	 * Whether to offer the rewriter: switched on, and with a model to run it,
	 * its own, or failing that the one this account uses for everything else.
	 */
	const canRewrite = $derived(
		$chatDefaultsConfig.images.imagePromptWriter &&
			!!($chatDefaultsConfig.images.imagePromptModel || $chatDefaultsConfig.defaultModel.value)
	);

	// The instance's or the account's default, and failing both the first model
	// that can draw, so the field is never empty on arrival.
	onMount(() => {
		if (model) return;
		const preferred = $chatDefaultsConfig.images.defaultImageModel;
		model =
			($imageModels.some((m) => m.name === preferred) ? preferred : $imageModels[0]?.name) ?? '';
	});

	async function rewrite() {
		if (!prompt.trim()) return;
		rewriting = true;
		// Emptied first, so a second run does not read as the first one still there
		// while the model thinks. The panel opens on `rewriting`, not on the text.
		rewritten = '';
		try {
			const text = await writeImagePrompt(prompt, (partial) => (rewritten = partial));
			if (text) rewritten = text;
			else toast.error($LL.imageRewriteFailed());
		} catch (error) {
			// Whatever landed before it failed is half a sentence, and half a sentence
			// left in the field is one somebody sends by mistake.
			rewritten = '';
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
			const made = await generateImages({
				serverId,
				model,
				// Both, always. The words that were typed are what the gallery shows and
				// what a search would match; the rewrite is what was actually sent, and
				// keeping it is what makes "why does this not look like what I asked
				// for" a question with an answer.
				prompt: prompt.trim(),
				sentPrompt: rewritten.trim() || undefined,
				negativePrompt: negativePrompt.trim() || undefined,
				// The app's own words. The server holds the connection, so it is the side
				// that knows what this provider calls them, and it translates there.
				ratio,
				quality,
				n: count,
				references: references.length ? references.map((image) => image.dataUrl) : undefined
			});

			// Sent, so it is no longer a draft. The field keeps the words on purpose,
			// but there is nothing left to restore after a reload that it would not
			// already have.
			clearDraft(IMAGE_DRAFT);

			// Not awaited: the pictures are already on screen, and a label arriving a
			// moment later is a label arriving a moment later.
			void titleImages(made, rewritten.trim() || prompt.trim());
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
	 * bytes `inline`: going to it would show the image instead of saving it, and
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
		if (image.ratio) ratio = image.ratio;
		if (image.quality) quality = image.quality;
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

<!-- One trigger for the three lists on the strip: the value and a chevron, no box
     of its own, because the group around them owns the border. Sized to what it
     says, so the strip does not reserve three equal columns for three answers of
     very different lengths. -->
{#snippet compactTrigger({ props, label }: { props: Record<string, unknown>; label: string })}
	<button
		{...props}
		type="button"
		class="text-muted hover:bg-shade-2 hover:text-active data-[state=open]:text-active flex h-9 items-center gap-1 bg-transparent px-2.5 text-xs transition-colors focus:outline-none disabled:opacity-50"
	>
		<span class="truncate">{label}</span>
		<ChevronDown class="h-3 w-3 shrink-0 opacity-60" />
	</button>
{/snippet}

<Head title={$LL.images()} />

<!-- Frameless like the library and the sessions landing, and carrying a surface
     for the same reason. -->
<div
	class="app-panel surface-pane flex h-full flex-col [--surface-color:var(--color-shade-1)] lg:rounded-xl lg:[--surface-color:var(--color-shade-2)]"
>
	<div class="min-h-0 flex-1 overflow-auto">
		<MobileMenuBar />
		<div class="mx-auto w-full max-w-5xl px-6 py-8">
			<!-- Same header as the library's, and the same height by construction rather
			     than by a floor set here: the row is as tall as its button, and that
			     button is the same button. -->
			<div class="mb-1 flex items-center justify-between gap-3">
				<h1 class="text-active truncate text-xl font-semibold tracking-tight">{$LL.images()}</h1>

				{#if $imagesStore.length}
					<div class="flex shrink-0 items-center gap-2">
						<!-- How many, next to the thing that acts on them rather than next to
						     the title: it is the size of what you are about to export. -->
						<span class="text-muted text-xs tabular-nums">
							{$LL.imagesCount({ count: $imagesStore.length })}
						</span>

						<Menu>
							{#snippet trigger({ props })}
								<button
									{...props}
									type="button"
									class="border-accent bg-accent text-shade-0 flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-opacity hover:opacity-90"
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
			<p class="text-muted mb-7 text-sm">{$LL.imagesSubtitle()}</p>

			{#if $canDrawImages}
				<!-- What makes a new one. At the top because that is where the page starts,
				     and because everything below it is the result.

				     Built as one surface rather than a stack of form rows: the words, the
				     controls that qualify them and the button that acts on them are one
				     gesture, so they share a frame and the field inside it has no border of
				     its own. Same idea as the composer in a conversation, in the shape this
				     page needs. -->
				<ImageDrop
					enabled={!!accepts}
					label={$LL.imageReferencesDrop()}
					refusal={$LL.imageReferencesUnsupported()}
					onImages={addReferences}
					class="library-section bg-shade-0 focus-within:border-accent section-tint mb-8 overflow-hidden rounded-2xl border shadow-sm transition-colors"
					style="--section-turn: 40"
				>
					<!-- The words and the model that will draw them, in one box. The model
					     sits in the corner rather than on the strip below because it is not a
					     setting you adjust, it is the thing being addressed: you write to a
					     model the way you write to somebody. `pb-11` is the room it needs, so
					     a third line of prompt stops above it instead of running underneath. -->
					<div class="relative">
						<textarea
							bind:value={prompt}
							rows="3"
							maxlength={IMAGE_LIMITS.prompt}
							placeholder={$LL.imagePromptPlaceholder()}
							class="placeholder:text-muted w-full resize-none border-0 bg-transparent pt-4 pr-11 pb-2 pl-4 text-base leading-relaxed outline-none"
						></textarea>
						{#if composerFilled}
							<!-- The opposite corner from the model, and only while there is
							     something to undo. Fading in rather than appearing keeps it from
							     flicking on and off as the first character is typed and deleted. -->
							<div class="absolute top-2.5 right-2.5" transition:fade={{ duration: 120 }}>
								<Tooltip side="left">
									{#snippet trigger({ props })}
										<button
											{...props}
											type="button"
											onclick={resetComposer}
											aria-label={$LL.imageComposerReset()}
											class="text-muted hover:bg-shade-2 hover:text-active rounded-md p-1.5 transition-colors focus:outline-none"
										>
											<Eraser class="h-3.5 w-3.5" />
										</button>
									{/snippet}
									{$LL.imageComposerReset()}
								</Tooltip>
							</div>
						{/if}
						{#if canRewrite && (rewriting || rewritten)}
							<!-- Opened by the asking, not by the answer. It used to wait for the
							     finished text, so the one thing that said anything was happening
							     was a spinner on a button at the other end of the strip, and then
							     a box appeared fully formed. Now the panel is there from the
							     click and the words land inside it.

							     Shown, not applied: what is in this box is what gets sent, and
							     emptying it sends the words above instead. Tinted with the accent
							     so it reads as something the app added rather than something you
							     typed. -->
							<div
								transition:slide={{ duration: 180, easing: cubicOut }}
								class="mx-4 mb-3 overflow-hidden"
							>
								<div class="bg-accent/[0.07] flex flex-col gap-1.5 rounded-xl p-3">
									<div class="flex items-center gap-2">
										{#if rewriting}
											<LoaderCircle class="text-accent h-3.5 w-3.5 shrink-0 animate-spin" />
										{:else}
											<Wand2 class="text-accent h-3.5 w-3.5 shrink-0" />
										{/if}
										<span class="text-active text-xs font-medium">{$LL.imageRewritten()}</span>
										{#if !rewriting}
											<button
												type="button"
												onclick={() => (rewritten = '')}
												class="text-link ml-auto text-xs"
											>
												{$LL.imageUseOriginal()}
											</button>
										{/if}
									</div>
									<!-- Read-only while it fills, because the caret would be fighting
									     the model for the same field, and a word typed into it would
									     be overwritten by the next fragment. -->
									<textarea
										bind:value={rewritten}
										readonly={rewriting}
										rows="3"
										maxlength={IMAGE_LIMITS.prompt}
										placeholder={rewriting ? $LL.imageRewriting() : ''}
										class="border-shade-3 bg-shade-0 focus:border-accent placeholder:text-muted w-full resize-none rounded-lg border p-2 text-sm leading-relaxed outline-none read-only:cursor-default"
									></textarea>
									<span class="text-muted text-xs leading-snug">
										{rewriting ? $LL.imageRewriting() : $LL.imageRewrittenHint()}
									</span>
								</div>
							</div>
						{/if}

						<!-- On its own row at the foot of the box rather than laid over it: the
						     rewrite panel appears above it, and an absolute corner would have
						     been covered by it the moment it opened. -->
						<div class="flex justify-end px-2.5 pb-2">
							<ModelSelect bind:value={model} kinds={['image']} variant="ghost" />
						</div>
					</div>

					{#if showAdvanced}
						<div class="mx-4 mb-3 flex flex-col gap-1.5">
							<input
								bind:value={negativePrompt}
								maxlength={IMAGE_LIMITS.negativePrompt}
								placeholder={$LL.imageNegativePromptPlaceholder()}
								aria-label={$LL.imageNegativePrompt()}
								class="border-shade-3 bg-shade-1 placeholder:text-muted focus:border-accent w-full rounded-lg border px-3 py-2 text-sm outline-none"
							/>
							<span class="text-muted text-xs leading-snug">{$LL.imageNegativePromptHelp()}</span>
						</div>
					{/if}

					{#if missingTrigger}
						<!-- Beside the pictures rather than under the button: it is a rule about
						     what the words must say, and it appears when there is something for
						     them to say it about. -->
						<p class="text-muted mx-4 mb-3 text-xs leading-snug">
							{$LL.imageReferencesTrigger({ word: missingTrigger })}
						</p>
					{/if}

					{#if references.length}
						<!-- What the drawing will work from, as thumbnails rather than names: a
						     reference is a picture, and a filename is not one. -->
						<div class="mx-4 mb-3 flex flex-wrap gap-2">
							{#each references as reference (reference.id)}
								<span
									class="group border-shade-3 relative h-14 w-14 overflow-hidden rounded-lg border"
								>
									<img
										src={reference.dataUrl}
										alt={reference.name}
										class="h-full w-full object-cover"
									/>
									<button
										type="button"
										onclick={() => (references = references.filter((r) => r.id !== reference.id))}
										aria-label={$LL.remove()}
										class="absolute top-0.5 right-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-black/55 text-white opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
									>
										<X class="h-3 w-3" />
									</button>
								</span>
							{/each}
						</div>
					{/if}

					<!-- The controls, on their own strip at the foot of the surface. A hairline
					     rather than a second card: they qualify the words above, they are not a
					     separate subject. -->
					<div
						class="border-shade-2 bg-shade-1/60 flex flex-wrap items-center gap-2 border-t px-3 py-2.5"
					>
						<!-- Two groups rather than five boxes. What you hand the model sits on
						     the left, how it should draw sits beside it, and each group owns one
						     border so the strip reads as two objects instead of a row of fields
						     all shouting the same way. It is the joined control the conversation
						     header already uses, applied twice. -->
						<div
							class="border-shade-3 focus-within:border-accent flex shrink-0 items-center overflow-hidden rounded-lg border transition-colors"
						>
							<!-- The other way in, for a pointer that would rather not drag.
							     Disabled rather than hidden on a model that takes none, for the
							     same reason the selects beside it are: the control still says what
							     it would have done. -->
							<Tooltip side="top">
								{#snippet trigger({ props })}
									<!-- The tooltip listens on the wrapper, not on the button. A
									     disabled button emits no pointer events at all, so hanging it
									     there would hide the explanation in exactly the case it exists
									     for: the model this one cannot work with. -->
									<span {...props} class="inline-flex">
										<button
											type="button"
											onclick={pickReferences}
											disabled={!accepts || roomLeft <= 0}
											aria-label={$LL.imageReferences()}
											class="border-shade-3 flex h-9 w-9 items-center justify-center border-r transition-colors focus:outline-none disabled:opacity-50 {references.length
												? 'bg-accent/10 text-accent'
												: 'text-muted hover:bg-shade-2 hover:text-active'}"
										>
											<Paperclip class="h-3.5 w-3.5" />
										</button>
									</span>
								{/snippet}
								{accepts
									? $LL.imageReferencesRoom({ count: roomLeft })
									: $LL.imageReferencesUnsupported()}
							</Tooltip>

							<!-- The rarely-used half, as a toggle rather than a link that reads
							     like a page. `Ban` and not a slider: what this opens is the list of
							     things you do not want in the picture, which is a refusal, where a
							     slider would promise settings to adjust. It shows it is on by
							     staying lit. -->
							<Tooltip side="top">
								{#snippet trigger({ props })}
									<button
										{...props}
										type="button"
										onclick={() => (showAdvanced = !showAdvanced)}
										aria-expanded={showAdvanced}
										aria-label={$LL.imageNegativePrompt()}
										class="flex h-9 w-9 items-center justify-center transition-colors focus:outline-none {showAdvanced
											? 'bg-accent/10 text-accent'
											: 'text-muted hover:bg-shade-2 hover:text-active'}"
									>
										<Ban class="h-3.5 w-3.5" />
									</button>
								{/snippet}
								{$LL.imageNegativePrompt()}
							</Tooltip>
						</div>

						<!-- Disabled, not hidden, where the app has no translation: the control
						     still says what it would have controlled, and the request simply
						     leaves the field out so the model uses its own default.

						     The app's own picker, not a raw `<select>`: portalled so the panel is
						     never clipped by the composer's `overflow-hidden`, flipped when there
						     is no room below, and drawn by the app rather than by the operating
						     system, which is the difference between three controls that match the
						     strip and three that match whatever platform you are on.

						     The divider sits on the wrapper rather than on each trigger, so one
						     snippet serves all three. -->
						<!-- Allowed to shrink, unlike the icons beside it: three answers of very
						     different lengths ("Landscape", "Standard", "1 image") are what push
						     this strip past a phone's width, and the triggers already truncate.
						     Fixed again above `sm`, where it reads better at its natural size. -->
						<div
							class="border-shade-3 focus-within:border-accent flex min-w-0 flex-1 items-center overflow-hidden rounded-lg border transition-colors sm:flex-none sm:shrink-0"
						>
							<div class="border-shade-3 min-w-0 border-r">
								<Select
									value={ratio}
									options={RATIO_OPTIONS}
									disabled={!options.sizes}
									trigger={compactTrigger}
									onChange={(option) => (ratio = option.value as ImageRatio)}
								/>
							</div>
							<div class="border-shade-3 min-w-0 border-r">
								<Select
									value={quality}
									options={QUALITY_OPTIONS}
									disabled={!options.qualities}
									trigger={compactTrigger}
									onChange={(option) => (quality = option.value as ImageQuality)}
								/>
							</div>
							<Select
								value={String(count)}
								options={COUNT_OPTIONS}
								trigger={compactTrigger}
								onChange={(option) => (count = Number(option.value))}
							/>
						</div>

						<!-- A row of their own below `sm`, decided rather than left to the
						     wrap: with everything set to shrink last, the browser broke the line
						     wherever it ran out and `ml-auto` then pushed the remainder around.
						     Three ragged rows on a phone. Above `sm` they go back to the right
						     end of the single row. -->
						<div
							class="flex w-full items-center justify-end gap-2 max-sm:order-last sm:ml-auto sm:w-auto"
						>
							{#if canRewrite}
								<button
									type="button"
									onclick={rewrite}
									disabled={rewriting || busy || !prompt.trim()}
									title={$LL.imageRewrite()}
									class="border-shade-3 text-muted hover:text-active flex h-9 items-center gap-1.5 rounded-lg border px-2.5 text-xs transition-colors disabled:pointer-events-none disabled:opacity-50"
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
								class="bg-accent text-shade-0 disabled:bg-shade-3 disabled:text-muted flex h-9 items-center justify-center gap-1.5 rounded-lg px-3 text-xs font-medium transition-opacity hover:opacity-90 disabled:pointer-events-none max-sm:flex-1"
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
				</ImageDrop>
			{/if}

			<!-- The gallery. Newest first, because the one you just made is the one you
			     want to look at.

			     Two columns on a phone, stated rather than left to `auto-fill`. A 190px
			     floor needs 392px for two tracks and a gap, which no phone has once the
			     page's own margins are taken out, so the fill rule quietly collapsed to a
			     single column of pictures the width of the screen. Above `sm` the floor
			     fits and the fill rule is the better answer, because it keeps the tiles
			     the same size at every window width instead of stretching them. -->
			{#if $imagesStore.length || busy}
				<div class="grid grid-cols-2 gap-3 sm:grid-cols-[repeat(auto-fill,minmax(190px,1fr))]">
					{#if busy}
						<!-- One placeholder per picture asked for, at the front, where the
						     pictures will be. Thirty seconds of a spinner somewhere else reads
						     as a page that has stopped; thirty seconds of the shapes filling in
						     reads as a page that is working, and it says how many are coming. -->
						{#each Array.from({ length: count }, (_, i) => i) as slot (slot)}
							<div
								class="border-accent/40 bg-accent/5 flex aspect-square animate-pulse items-center justify-center rounded-xl border border-dashed"
								style="animation-delay: {slot * 150}ms"
							>
								<ImageIcon class="text-accent/40 h-6 w-6" />
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
							class="group border-shade-3 bg-shade-1 hover:border-shade-4 focus-visible:border-accent relative aspect-square overflow-hidden rounded-xl border transition-all hover:shadow-md focus-visible:outline-none"
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
								class="absolute top-2 left-2 h-2 w-2 rounded-full ring-1 ring-black/20"
								style="background-color: {badgeColor(image.serverId)}"
							></span>

							<!-- The prompt, on the picture, on hover and on keyboard focus. A grid
							     of pictures with no words is a grid you open one by one to search.
							     Focus counts as hover here, or the keyboard never sees it.

							     The same one the dialog shows: what was actually sent, so the two
							     never disagree about what made this picture.

							     One line, truncated. Two lines clamped left a long prompt broken
							     off mid-thought across the bottom of a thumbnail, which is neither
							     readable nor a summary. One line ending in an ellipsis is honest
							     about being an excerpt, and the dialog is one click away for the
							     rest. -->
							<span
								class="pointer-events-none absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/85 via-black/45 to-transparent px-2.5 pt-5 pb-2 text-left text-[11px] leading-snug text-white opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-visible:opacity-100"
							>
								{image.title || image.sentPrompt || image.prompt}
							</span>
						</button>
					{/each}
				</div>
			{:else if $imagesLoaded && $canDrawImages}
				<!-- Empty, and saying so as an invitation rather than as a fault. -->
				<div
					class="border-shade-4 flex flex-col items-center gap-2 rounded-2xl border border-dashed px-6 py-14 text-center"
				>
					<div class="bg-accent/10 flex h-12 w-12 items-center justify-center rounded-full">
						<ImageIcon class="text-accent h-5 w-5" />
					</div>
					<p class="text-muted max-w-sm text-sm">{$LL.imagesEmpty()}</p>
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
     could open it again, every later click set a different picture behind a
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
		<div class="relative flex h-full w-full flex-col">
			<!-- The picture again, behind the whole dialog rather than behind its middle.

			     The same source, so the browser serves it from the cache it already has:
			     this costs a paint, not a request. Scaled up past its own edges because a
			     blur softens the border it is given, and a softened border against the
			     panel reads as a mistake; enlarging it puts that edge outside the box,
			     which the dialog's own clipping then takes care of.

			     Dimmed hard, and that is the whole restraint here: what is underneath must
			     never compete with what is on top, and the figures in the corner are white
			     text that has to stay legible over whatever the picture happens to be.
			     Decoration, so it is hidden from anything that reads. -->
			<img
				src={imageUrl(image.id)}
				alt=""
				aria-hidden="true"
				class="pointer-events-none absolute inset-0 h-full w-full scale-110 object-cover opacity-40 blur-2xl"
			/>

			<!-- Actions in the title bar, beside the close, and no footer at all. The
			     library's editors settled this: a pinned band costs a full stripe of
			     height on every dialog to hold two buttons, and the bar that carries the
			     close is already there and already pinned. Here it buys the picture that
			     height back, which is the whole point of the dialog. -->
			<div
				class="border-shade-2/40 bg-shade-0/20 relative flex h-12 shrink-0 items-center gap-3 border-b px-4 backdrop-blur-xl"
			>
				<div class="flex min-w-0 flex-1 items-center gap-2">
					<span
						class="inline-block h-2 w-2 shrink-0 rounded-full"
						style="background-color: {badgeColor(image.serverId)}"
					></span>
					<span class="text-active truncate text-sm font-semibold">
						{image.title || modelLabel(serverFor(image.serverId), image.model)}
					</span>
				</div>

				<!-- What it took to make, in the bar rather than over the picture.
				
				     It was a floating label in the corner, which meant it took room from
				     the image at every width, including the ones where it was too small to
				     read. Here it takes room only where there is room, and below `sm` it is
				     simply not drawn: four figures nobody came for should not be the reason
				     a picture is smaller on a phone.
				
				     The model id is the one part with no ceiling of its own, since some run
				     to forty characters, so it is given one. -->
				<div class="text-muted hidden shrink-0 items-center gap-2 text-[10px] leading-4 sm:flex">
					<span class="max-w-[9rem] truncate">
						{modelLabel(serverFor(image.serverId), image.model)}
					</span>
					{#if image.size}<span class="tabular-nums">{image.size}</span>{/if}
					<span>{formatTimestampToNow(image.createdAt)}</span>
					{#if image.seconds}<span class="tabular-nums">{image.seconds.toFixed(1)}s</span>{/if}
					{#if costLabel(image)}
						<span class="flex items-center gap-1 tabular-nums">
							<Coins class="h-2.5 w-2.5" />
							{costLabel(image)}
						</span>
					{/if}
				</div>

				<div class="flex shrink-0 items-center gap-1">
					<button
						type="button"
						onclick={() => reuse(image)}
						title={$LL.imageReusePrompt()}
						aria-label={$LL.imageReusePrompt()}
						class="text-muted hover:bg-shade-2 hover:text-active rounded-md p-1.5 transition-colors"
					>
						<RotateCcw class="h-4 w-4" />
					</button>
					<!-- A plain link to the same authenticated route the grid reads. The
					     download attribute only names the file; the session is what allows
					     it, exactly as for the picture already on screen. -->
					<button
						type="button"
						onclick={() => saveAs(imageUrl(image.id), downloadName(image))}
						title={$LL.download()}
						aria-label={$LL.download()}
						class="text-muted hover:bg-shade-2 hover:text-active rounded-md p-1.5 transition-colors"
					>
						<ArrowDownToLine class="h-4 w-4" />
					</button>
					<button
						type="button"
						onclick={() =>
							confirmingDelete === image.id ? remove(image.id) : (confirmingDelete = image.id)}
						title={confirmingDelete === image.id ? $LL.confirmDeletion() : $LL.delete()}
						aria-label={confirmingDelete === image.id ? $LL.confirmDeletion() : $LL.delete()}
						class="rounded-md p-1.5 transition-colors {confirmingDelete === image.id
							? 'bg-negative/10 text-negative'
							: 'text-muted hover:bg-shade-2 hover:text-negative'}"
					>
						<Trash2 class="h-4 w-4" />
					</button>

					<!-- A rule between what the dialog does and what closes it: destructive
					     controls should not sit flush against the one everybody aims for. -->
					<span class="bg-shade-3 mx-1 h-5 w-px"></span>

					<button
						type="button"
						onclick={() => (opened = null)}
						aria-label={$LL.close()}
						class="text-muted hover:bg-shade-2 hover:text-active rounded-md p-1.5 transition-colors"
					>
						<X class="h-4 w-4" />
					</button>
				</div>
			</div>

			<!-- `min-h-0` is what makes the rest of this work: without it a flex child
			     refuses to shrink below its content, so the image would push the strip
			     below it off the bottom instead of fitting between them. -->
			<!-- The two panes differ by how far each blurs the backdrop, not by how much
			     paint each puts over it.
			
			     Paint was the first attempt and it was wrong, because it stacked: the
			     backdrop is already a partly transparent picture over a light surface, so
			     a second translucent white on the bar added to the first and the bar came
			     out nearly opaque. Blur adds nothing. It softens what is already there
			     until it stops competing with text, which is the whole job, and it is the
			     same trade the app's own surfaces make everywhere else: transparency and
			     blur move together, and neither is any use alone. -->
			<!-- The picture stops where the prompt starts.
			
			     It used to run underneath it, which is what a floating bar does by
			     definition, and on a landscape image the bar sat squarely across the
			     bottom of the subject. The bar keeps its floating look (it is still over
			     the blurred backdrop, not in a band of its own) but the box the picture
			     is fitted into gives up exactly the room the bar occupies.
			
			     Measured rather than assumed, because that height is one line or ten
			     depending on what has been opened. There is no cycle to worry about here:
			     the bar is positioned against the box's edges, so its height does not
			     depend on the padding this sets. The padding rides the same transition as
			     the unfolding, so the picture rises with it instead of jumping at the end. -->
			<div
				class="relative flex min-h-0 flex-1 items-center justify-center p-3 transition-[padding] duration-300 ease-out motion-reduce:transition-none"
				style="padding-bottom: {promptBarHeight + 24}px"
			>
				<img
					src={imageUrl(image.id)}
					alt={image.prompt}
					class="relative max-h-full max-w-full rounded-lg object-contain shadow-lg"
				/>

				<!-- The prompt, floating along the foot of the picture rather than in a band
				     under it. One line closed, the whole of it open, and the way to open it
				     at the far right of that same line.

				     No ellipsis, and that is a choice rather than an oversight. The clip
				     lands on a line boundary, so it never cuts through a letter, and the
				     control sitting at the end of the line already says there is more,
				     which is the only job an ellipsis would have had. It also keeps the
				     opening animation honest in both directions: `line-clamp` has no
				     in-between, so re-applying one on the way closed would snap the text to
				     a line while the box was still travelling.

				     `items-start` so the control stays level with the first line once the
				     rest has unfolded beneath it. -->
				<div
					bind:clientHeight={promptBarHeight}
					class="absolute inset-x-3 bottom-3 flex items-start gap-2 rounded-lg bg-black/55 px-2.5 py-1.5 backdrop-blur-sm"
				>
					<div
						class="min-w-0 flex-1 overflow-hidden transition-[max-height] duration-300 ease-out motion-reduce:transition-none"
						style="max-height: {expandedPrompt ? promptHeight : collapsedHeight}px"
					>
						<div bind:clientHeight={promptHeight}>
							<!-- One prompt, and it is the one that was sent: the rewrite when
							     there was one, the words as typed otherwise. The wand stays when
							     it applies, because "these are not quite the words I typed" is the
							     one thing the difference is worth saying.

							     An explicit leading, because the collapsed height is a multiple of
							     it. Left to the default it is a fraction nobody can divide by. -->
							<p
								bind:clientHeight={promptOnlyHeight}
								class="text-[11px] leading-4 whitespace-pre-wrap text-white"
							>
								{#if image.sentPrompt}<Wand2 class="mr-1 inline h-3 w-3" />{/if}{image.sentPrompt ||
									image.prompt}
							</p>
							{#if image.negativePrompt}
								<p class="mt-1 text-[11px] leading-4 text-white/70">
									{$LL.imageNegativePrompt()} · {image.negativePrompt}
								</p>
							{/if}
						</div>
					</div>

					<!-- Offered only when there is something to open. A prompt of six words
					     with a control beside it that does nothing is worse than no control. -->
					{#if promptHeight > collapsedHeight}
						<button
							type="button"
							onclick={() => (expandedPrompt = !expandedPrompt)}
							aria-expanded={expandedPrompt}
							aria-label={expandedPrompt ? $LL.showLess() : $LL.showMore()}
							title={expandedPrompt ? $LL.showLess() : $LL.showMore()}
							class="shrink-0 rounded p-0.5 text-white/70 transition-colors hover:text-white"
						>
							<ChevronDown
								class="h-3.5 w-3.5 transition-transform duration-300 motion-reduce:transition-none {expandedPrompt
									? 'rotate-180'
									: ''}"
							/>
						</button>
					{/if}
				</div>
			</div>
		</div>
	{/if}
</Modal>
