<script lang="ts">
	import { ArrowDownToLine, ChevronDown, Coins, RotateCcw, Wand2, X } from '@lucide/svelte';

	import LL from '$i18n/i18n-svelte';
	import ButtonConfirm from '$lib/components/ButtonConfirm.svelte';
	import Modal from '$lib/components/Modal.svelte';
	import { modelLabel, serverBadge } from '$lib/connections';
	import { downloadName, type GeneratedImage } from '$lib/generatedImages';
	import { deleteImage, imageUrl } from '$lib/images';
	import { serversStore } from '$lib/localStorage';
	import { toast } from '$lib/toast';
	import { formatTimestampToNow } from '$lib/utils';

	/** Lifted out of the images page, so the strip on the home page opens the same viewer. What differs between the two callers is whether there is a prompt field to send a picture back to, which is what `onReuse` says. */
	interface Props {
		/** The picture on screen, or nothing. Cleared when the dialog closes. */
		image: GeneratedImage | null;
		/** Offered where the caller has a form to fill from it. */
		onReuse?: (image: GeneratedImage) => void;
	}

	let { image = $bindable(), onReuse }: Props = $props();

	/** How much of the prompt is unfolded, and the measurements that drive it. */
	let expandedPrompt = $state(false);
	let promptBarHeight = $state(0);
	let promptHeight = $state(0);
	let promptOnlyHeight = $state(0);

	/** One line of the prompt, in the leading the paragraph is set in. */
	const PROMPT_LINE = 16;
	const collapsedHeight = $derived(Math.min(promptOnlyHeight, PROMPT_LINE));

	const serverFor = (id: string) => $serversStore.find((server) => server.id === id);

	function badgeColor(serverId: string): string {
		const server = serverFor(serverId);
		return server ? serverBadge(server).color : '#888780';
	}

	function costLabel(picture: GeneratedImage): string | undefined {
		if (picture.cost === undefined) return undefined;
		// Four decimals: a picture costing a third of a centime should not read as free,
		// which is what two decimals would make of it.
		return `${picture.cost.toFixed(4)} ${picture.currency ?? 'USD'}`;
	}

	/** A plain link to the same authenticated route the grid reads: the download attribute only names the file, the session is what allows it. */
	function saveAs(url: string, name?: string) {
		const link = document.createElement('a');
		link.href = url;
		if (name) link.download = name;
		document.body.appendChild(link);
		link.click();
		link.remove();
	}

	async function remove(id: string) {
		try {
			await deleteImage(id);
			image = null;
		} catch {
			toast.error($LL.imageDeleteFailed());
		}
	}

	// The prompt folds back when another picture is opened: it is a property of
	// what is on screen, not of the dialog.
	$effect(() => {
		void image?.id;
		expandedPrompt = false;
	});
</script>

<!-- Bound in both directions, and it has to be: the dialog closes on Escape and
     on a click outside as well as on its own button. Handed a plain expression it
     shut itself while `opened` stayed full, and since the expression never
     changed value nothing could open it again. -->
<Modal
	bind:open={
		() => !!image,
		(isOpen) => {
			if (!isOpen) image = null;
		}
	}
	closeButton={false}
>
	{#if image}
		{@const picture = image}
		<!-- The dialog is a fixed box, so this fills it and divides it. Header, footer
		     and the strip of facts hold their own height; everything left over is the
		     picture's, which is what stops a large image turning the dialog into a page
		     you scroll. -->
		<div class="relative flex h-full w-full flex-col">
			<!-- The picture again, behind the whole dialog. The same source, so the browser
			     serves it from cache: this costs a paint, not a request. Scaled past its own
			     edges because a blur softens the border it is given, and the dialog's
			     clipping then takes care of it. -->
			<img
				src={imageUrl(picture.id)}
				alt=""
				aria-hidden="true"
				class="pointer-events-none absolute inset-0 h-full w-full scale-110 object-cover opacity-40 blur-2xl"
			/>

			<!-- Actions in the title bar and no footer: a pinned band costs a stripe of
			     height on every dialog to hold two buttons, and the bar carrying the close is
			     already there. Here it buys the picture that height back. -->
			<div
				class="border-shade-2/40 bg-shade-0/20 relative flex h-12 shrink-0 items-center gap-3 border-b px-4 backdrop-blur-xl"
			>
				<div class="flex min-w-0 flex-1 items-center gap-2">
					<span
						class="inline-block h-2 w-2 shrink-0 rounded-full"
						style="background-color: {badgeColor(picture.serverId)}"
					></span>
					<span class="text-active truncate text-sm font-semibold">
						{picture.title || modelLabel(serverFor(picture.serverId), picture.model)}
					</span>
				</div>

				<!-- What it took to make, in the bar rather than over the picture: as a floating
				     label it took room from the image at every width. Here it takes room only
				     where there is room, and below `sm` it is not drawn at all. -->
				<div class="text-muted hidden shrink-0 items-center gap-2 text-[10px] leading-4 sm:flex">
					<span class="max-w-[9rem] truncate">
						{modelLabel(serverFor(picture.serverId), picture.model)}
					</span>
					{#if picture.size}<span class="tabular-nums">{picture.size}</span>{/if}
					<span>{formatTimestampToNow(picture.createdAt)}</span>
					{#if picture.seconds}<span class="tabular-nums">{picture.seconds.toFixed(1)}s</span>{/if}
					{#if costLabel(picture)}
						<span class="flex items-center gap-1 tabular-nums">
							<Coins class="h-2.5 w-2.5" />
							{costLabel(picture)}
						</span>
					{/if}
				</div>

				<div class="flex shrink-0 items-center gap-1">
					{#if onReuse}
						<!-- Only where there is a form to fill: on the home page this opens over a page
						     with no prompt field, and a button that quietly does nothing is worse. -->
						<button
							type="button"
							onclick={() => onReuse(picture)}
							title={$LL.imageReusePrompt()}
							aria-label={$LL.imageReusePrompt()}
							class="text-muted hover:bg-shade-2 hover:text-active rounded-md p-1.5 transition-colors"
						>
							<RotateCcw class="h-4 w-4" />
						</button>
					{/if}
					<!-- A plain link to the same authenticated route the grid reads. -->
					<button
						type="button"
						onclick={() => saveAs(imageUrl(picture.id), downloadName(picture))}
						title={$LL.download()}
						aria-label={$LL.download()}
						class="text-muted hover:bg-shade-2 hover:text-active rounded-md p-1.5 transition-colors"
					>
						<ArrowDownToLine class="h-4 w-4" />
					</button>
					<ButtonConfirm onConfirm={() => remove(picture.id)} />

					<!-- A rule between what the dialog does and what closes it: destructive controls
					     should not sit flush against the one everybody aims for. -->
					<span class="bg-shade-3 mx-1 h-5 w-px"></span>

					<button
						type="button"
						onclick={() => (image = null)}
						aria-label={$LL.close()}
						class="text-muted hover:bg-shade-2 hover:text-active rounded-md p-1.5 transition-colors"
					>
						<X class="h-4 w-4" />
					</button>
				</div>
			</div>

			<!-- `min-h-0` is what makes the rest work: without it a flex child refuses to
			     shrink below its content, so the image would push the strip off the bottom. -->
			<!-- The two panes differ by how far each blurs the backdrop, not by how much
			     paint each puts over it. Paint stacked: the backdrop is already a partly
			     transparent picture, so a second translucent white came out nearly opaque.
			     Blur adds nothing and softens what is already there. -->
			<!-- The picture stops where the prompt starts. It used to run underneath, which
			     is what a floating bar does, and on a landscape image the bar sat across the
			     subject. The bar keeps its floating look, and the box the picture is fitted
			     into gives up exactly the room it occupies. Measured rather than assumed,
			     since that height is one line or ten. -->
			<div
				class="relative flex min-h-0 flex-1 items-center justify-center p-3 transition-[padding] duration-300 ease-out motion-reduce:transition-none"
				style="padding-bottom: {promptBarHeight + 24}px"
			>
				<img
					src={imageUrl(picture.id)}
					alt={picture.prompt}
					class="relative max-h-full max-w-full rounded-lg object-contain shadow-lg"
				/>

				<!-- The prompt, floating along the foot of the picture rather than in a band
				     under it: one line closed, the whole of it open, and the way to open it at
				     the far right of that line.

				     No ellipsis, deliberately: the clip lands on a line boundary so it never cuts
				     a letter, and the control at the end of the line already says there is more.
				     It also keeps the animation honest, since `line-clamp` has no in-between. -->
				<div
					bind:clientHeight={promptBarHeight}
					class="absolute inset-x-3 bottom-3 flex items-start gap-2 rounded-lg bg-black/55 px-2.5 py-1.5 backdrop-blur-sm"
				>
					<div
						class="min-w-0 flex-1 overflow-hidden transition-[max-height] duration-300 ease-out motion-reduce:transition-none"
						style="max-height: {expandedPrompt ? promptHeight : collapsedHeight}px"
					>
						<div bind:clientHeight={promptHeight}>
							<!-- One prompt, and it is the one that was sent: the rewrite where there was
							     one, the words as typed otherwise. The wand stays where it applies.

							     An explicit leading, because the collapsed height is a multiple of it. -->
							<p
								bind:clientHeight={promptOnlyHeight}
								class="text-[11px] leading-4 whitespace-pre-wrap text-white"
							>
								{#if picture.sentPrompt}<Wand2
										class="mr-1 inline h-3 w-3"
									/>{/if}{picture.sentPrompt || picture.prompt}
							</p>
							{#if picture.negativePrompt}
								<p class="mt-1 text-[11px] leading-4 text-white/70">
									{$LL.imageNegativePrompt()} · {picture.negativePrompt}
								</p>
							{/if}
						</div>
					</div>

					<!-- Offered only when there is something to open: a prompt of six words with a
					     control beside it that does nothing is worse than no control. -->
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
