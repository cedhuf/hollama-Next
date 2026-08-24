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

	/**
	 * One picture, as big as the dialog will allow.
	 *
	 * Lifted out of the images page so the strip on the home page can open the
	 * same viewer rather than sending people to another page to see what they had
	 * already clicked. Everything it needs is the picture itself; what differs
	 * between the two callers is whether there is a prompt field to send a picture
	 * back to, which is what `onReuse` says.
	 */
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
		// Four decimals: a picture that costs a third of a centime should not read
		// as free, which is what two decimals would make of it.
		return `${picture.cost.toFixed(4)} ${picture.currency ?? 'USD'}`;
	}

	/**
	 * A plain link to the same authenticated route the grid reads. The download
	 * attribute only names the file; the session is what allows it.
	 */
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
		() => !!image,
		(isOpen) => {
			if (!isOpen) image = null;
		}
	}
	closeButton={false}
>
	{#if image}
		{@const picture = image}
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
				src={imageUrl(picture.id)}
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
						style="background-color: {badgeColor(picture.serverId)}"
					></span>
					<span class="text-active truncate text-sm font-semibold">
						{picture.title || modelLabel(serverFor(picture.serverId), picture.model)}
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
						<!-- Only where there is a form to fill: on the home page this dialog
						     opens over a page with no prompt field, and a button that quietly
						     does nothing is worse than one that is not there. -->
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
					<!-- A plain link to the same authenticated route the grid reads. The
					     download attribute only names the file; the session is what allows
					     it, exactly as for the picture already on screen. -->
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

					<!-- A rule between what the dialog does and what closes it: destructive
					     controls should not sit flush against the one everybody aims for. -->
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
					src={imageUrl(picture.id)}
					alt={picture.prompt}
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
