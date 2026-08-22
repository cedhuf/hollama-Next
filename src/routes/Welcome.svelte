<script lang="ts">
	import {
		ArrowLeft,
		ArrowRight,
		AtSign,
		FileText,
		ImageIcon,
		Library,
		ListChecks,
		Palette,
		Sparkles
	} from '@lucide/svelte';
	import { cubicOut } from 'svelte/easing';
	import { fade, fly } from 'svelte/transition';

	import LL from '$i18n/i18n-svelte';
	import { APP_NAME } from '$lib/brand';
	import Button from '$lib/components/Button.svelte';
	import Logo from '$lib/components/Logo.svelte';
	import OnboardingDialog from '$lib/components/OnboardingDialog.svelte';
	import PersonaAvatar from '$lib/components/PersonaAvatar.svelte';
	import ThemePicker from '$lib/components/ThemePicker.svelte';
	import { canDrawImages } from '$lib/images';
	import { settingsStore } from '$lib/localStorage';
	import { catalogState, loadCatalog } from '$lib/personaCatalog';
	import { instanceConfig } from '$lib/stores/instance';
	import { welcomeOpen } from '$lib/stores/modal';
	import { TOUR_CAST, TOUR_TURN, tourAvatar, tourPersona } from '$lib/tourCast';

	/**
	 * The welcome tour shown once on a user's first connection (server mode). Unlike
	 * the local-mode wizard it configures nothing mandatory: the account already
	 * exists and its profile comes from the identity provider, so this is an
	 * introduction — what the app is, how it can look, and who you can talk to.
	 */
	let step = $state(0);

	/**
	 * Six steps where this instance draws, five where it does not.
	 *
	 * Counted rather than fixed, because the step it adds is about a feature an
	 * administrator may never have switched on, and introducing somebody to
	 * something they cannot reach is worse than saying less. The dots at the foot
	 * of the dialog read from the same number, so they stay honest too.
	 */
	const TOTAL_STEPS = $derived($canDrawImages ? 6 : 5);

	/**
	 * Pictures the app drew, on the step that says it can.
	 *
	 * Eleven for six tiles, which is the whole reason there are more than six: a
	 * tile hands over to the next picture in the pool at the one moment its own
	 * animation has it at zero opacity, so the grid keeps refilling for as long as
	 * anyone reads the step, and nobody sees a swap.
	 *
	 * Shipped with the app rather than fetched, small and square-cropped at build
	 * time: the tiles are square and a picture cropped at the source is a picture
	 * that is never upscaled to fill one.
	 */
	const TOUR_IMAGES = [
		'/tour/panda-insects.webp',
		'/tour/flower-warm.webp',
		'/tour/anime-clouds.webp',
		'/tour/cosmic-eye.webp',
		'/tour/record-shop.webp',
		'/tour/hanfu-sunset.webp',
		'/tour/panda-rain.webp',
		'/tour/studio-portrait.webp',
		'/tour/street-sunset.webp',
		'/tour/flower-rain.webp',
		'/tour/tropical-fruit.webp'
	];

	/** Six tiles, and the stagger the stylesheet brings them in on. */
	const TILES = 6;
	const TILE_STAGGER_MS = 170;
	/** How long the grid is left alone before one tile takes another picture. */
	const SWAP_MIN_MS = 1600;
	const SWAP_MAX_MS = 3600;
	/** The cross-fade, the same half-second the tiles arrive on. */
	const SWAP_FADE_MS = 500;

	let tileImages = $state(Array.from({ length: TILES }, (_, i) => i));
	/** The next picture to deal out, advanced past anything already on screen. */
	let nextImage = TILES;

	/**
	 * The picture after this one, skipping whatever is already up.
	 *
	 * Eleven pictures for six tiles, so there are always five to choose from and
	 * this cannot spin. Without the skip a tile could be dealt the picture its
	 * neighbour is holding, which is the one arrangement that reads as a bug.
	 */
	function deal(): number {
		let candidate = nextImage % TOUR_IMAGES.length;
		while (tileImages.includes(candidate)) {
			nextImage += 1;
			candidate = nextImage % TOUR_IMAGES.length;
		}
		nextImage += 1;
		return candidate;
	}

	/**
	 * One picture changes. Then, a while later, one other.
	 *
	 * A single timer rather than one per tile, which is what makes "one at a time" a
	 * property of the code instead of a hope about how six timers happen to fall.
	 * The wait is irregular so the grid never settles into a rhythm, and the tile is
	 * picked at random, never the one that just changed.
	 *
	 * The tiles keep the arrival they always had, fading up in sequence. They simply
	 * do it once now: looping it meant all six fading out and back in for ever, which
	 * is a grid blinking rather than pictures arriving.
	 *
	 * Nothing runs when the step is not on screen, and nothing runs for somebody who
	 * asked for less motion.
	 */
	$effect(() => {
		if (step !== 5) return;
		if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

		let timer: ReturnType<typeof setTimeout>;
		let last = -1;

		const queue = () => {
			timer = setTimeout(swap, SWAP_MIN_MS + Math.random() * (SWAP_MAX_MS - SWAP_MIN_MS));
		};

		function swap() {
			// Any tile but the one that just changed, so the eye is never sent back to
			// the same corner twice running.
			const offset = 1 + Math.floor(Math.random() * (TILES - 1));
			const tile = last < 0 ? Math.floor(Math.random() * TILES) : (last + offset) % TILES;
			last = tile;
			tileImages[tile] = deal();
			queue();
		}

		// Not before the last tile has landed: changing a picture during the entrance
		// would be a seventh thing happening while six are still arriving.
		timer = setTimeout(queue, TILES * TILE_STAGGER_MS + SWAP_FADE_MS);

		return () => clearTimeout(timer);
	});

	/** Four drift, and a fifth turns up when the mention step calls for it. */
	const drifting = TOUR_CAST.slice(0, 4);

	/**
	 * Where each one sits before it starts wandering, and which side its bubble is
	 * on. Opposite sides on opposite halves, so nothing can grow into anything
	 * else as the text wraps on a narrow screen.
	 */
	const SLOTS = [
		{ at: 'left-0 top-0', flip: false },
		{ at: 'right-0 top-[27%]', flip: true },
		{ at: 'left-2 top-[54%]', flip: false },
		{ at: 'right-1 bottom-0', flip: true }
	];

	const replies = $derived(
		TOUR_TURN.replies.map((reply) => ({
			...tourPersona(reply.id),
			says: $LL[reply.says]()
		}))
	);

	/**
	 * The store, asked once, for one line.
	 *
	 * The tour's characters are written down (see `tourCast`), so nothing here has
	 * to succeed for the step to make sense. What the store contributes is how many
	 * personas are actually available on this instance today, which is a fact only
	 * it has. If it cannot be reached the line is simply absent: an introduction
	 * that opens by apologising for a network call is worse than one that says
	 * slightly less.
	 */
	$effect(() => {
		if (step === 2) void loadCatalog();
	});

	const storeCount = $derived(
		$catalogState.status === 'ready' ? $catalogState.catalog.entries.length : 0
	);

	/**
	 * How far the little conversation has got.
	 *
	 * 1 is what you typed, then each persona takes two beats, thinking and then
	 * answering. A stage counter rather than a flag per bubble because the thing
	 * being played is a sequence, and a sequence with one number in it cannot get
	 * into a state where the second persona has answered before the first.
	 *
	 * The beats are real ones: the pause before an answer is the pause a model
	 * actually takes, and the dots during it are the dots the conversation shows.
	 * The step is a small replay of a turn, not a cartoon of one.
	 */
	let stage = $state(0);
	const finalStage = $derived(1 + replies.length * 2);

	$effect(() => {
		if (step !== 3) return;

		// Someone who asked for less motion asked for less motion, not for a slower
		// version of it: the whole thread is simply already there.
		if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
			stage = finalStage;
			return;
		}

		stage = 1;
		const timers: ReturnType<typeof setTimeout>[] = [];
		let at = 0;
		for (let i = 0; i < replies.length; i++) {
			at += 560;
			timers.push(setTimeout(() => (stage = i * 2 + 2), at));
			at += 900;
			timers.push(setTimeout(() => (stage = i * 2 + 3), at));
		}

		return () => timers.forEach(clearTimeout);
	});

	function finish() {
		$settingsStore.welcomeComplete = true;
		// Acknowledge the instance's current stamp, so this replay does not repeat.
		$settingsStore.onboardingEpochSeen = $instanceConfig?.onboardingEpoch ?? 0;
		$welcomeOpen = false;
		step = 0;
	}
</script>

<!-- The last step carries its own call to action, so it gets no footer. -->
{#snippet navFooter()}
	{#if step > 0}
		<Button variant="outline" onclick={() => (step -= 1)}>
			<ArrowLeft class="base-icon" />
		</Button>
	{:else}
		<span></span>
	{/if}
	<Button onclick={() => (step += 1)}>
		{$LL.tourContinue()}
		<ArrowRight class="base-icon" />
	</Button>
{/snippet}

<OnboardingDialog
	open={$welcomeOpen}
	{step}
	totalSteps={TOTAL_STEPS}
	onDismiss={finish}
	footer={step < TOTAL_STEPS - 1 ? navFooter : undefined}
>
	{#if step === 0}
		<!-- 1. Who we are -->
		<div class="flex flex-col items-center gap-4 py-6 text-center">
			<Logo class="h-16 w-16" />
			<div class="flex flex-col gap-1.5">
				<h2 class="text-xl font-semibold tracking-tight">{APP_NAME}</h2>
				<p class="text-muted mx-auto max-w-xs text-sm leading-relaxed">
					{$LL.tourIntro()}
				</p>
			</div>
		</div>
	{:else if step === 1}
		<!-- 2. Make it yours — applies live, saved as you click -->
		<div class="flex flex-col gap-4">
			<div class="flex flex-col items-center gap-2 pb-1 text-center">
				<div class="bg-accent/10 flex h-11 w-11 items-center justify-center rounded-full">
					<Palette class="text-accent h-5 w-5" />
				</div>
				<h2 class="text-lg font-semibold tracking-tight">{$LL.tourThemeTitle()}</h2>
				<p class="text-muted text-sm">{$LL.tourThemeBody()}</p>
			</div>
			<ThemePicker />
		</div>
	{:else if step === 2}
		<!-- 3. Who you can talk to -->
		<div class="flex flex-col gap-3">
			<div class="flex flex-col items-center gap-2 text-center">
				<div class="bg-accent/10 flex h-11 w-11 items-center justify-center rounded-full">
					<Sparkles class="text-accent h-5 w-5" />
				</div>
				<h2 class="text-lg font-semibold tracking-tight">{$LL.tourPersonasTitle()}</h2>
				<p class="text-muted mx-auto max-w-sm text-sm leading-relaxed">
					{$LL.tourPersonasBody()}
				</p>
			</div>

			<!-- They wander rather than sit in a list, because a list of four rows is a
			     table of contents and these are meant to read as people. The paths are
			     long, slow and out of phase with each other, so the group never falls
			     into step and nothing ever moves fast enough to chase. -->
			<div class="relative h-56">
				{#each drifting as persona, i (persona.id)}
					<div
						class="tour-drift absolute {SLOTS[i].at} flex max-w-[62%] items-center gap-2 {SLOTS[i]
							.flip
							? 'flex-row-reverse'
							: ''}"
						style="animation-duration:{9.5 + i * 1.9}s;animation-delay:{i * -2.7}s"
						in:fly={{ y: 10, duration: 360, delay: 120 * i, easing: cubicOut }}
					>
						<PersonaAvatar persona={tourAvatar(persona)} size={42} />
						<div class="min-w-0">
							<span class="text-muted mb-0.5 block px-1 text-[10px] font-medium">
								{persona.name}
							</span>
							<!-- A tail on the corner nearest its face, which is the whole of what
							     makes a rounded box read as speech rather than as a chip. -->
							<p
								class="border-shade-3 bg-shade-0 text-active rounded-2xl border px-2.5 py-1.5 text-[11px] leading-snug shadow-sm {SLOTS[
									i
								].flip
									? 'rounded-br-sm'
									: 'rounded-bl-sm'}"
							>
								{$LL[persona.line]()}
							</p>
						</div>
					</div>
				{/each}
			</div>

			{#if storeCount}
				<p class="text-muted text-center text-xs" in:fade={{ duration: 240 }}>
					{$LL.tourStoreCount({ count: storeCount })}
				</p>
			{/if}
		</div>
	{:else if step === 3}
		<!-- 4. Calling one into a conversation -->
		<div class="flex flex-col gap-4">
			<div class="flex flex-col items-center gap-2 text-center">
				<div class="bg-accent/10 flex h-11 w-11 items-center justify-center rounded-full">
					<AtSign class="text-accent h-5 w-5" />
				</div>
				<h2 class="text-lg font-semibold tracking-tight">{$LL.tourMentionTitle()}</h2>
				<p class="text-muted mx-auto max-w-sm text-sm leading-relaxed">
					{$LL.tourMentionBody()}
				</p>
			</div>

			<!-- The step plays the feature instead of describing it: a message with two
			     names in it, then two answers arriving one after the other. -->
			<div class="border-shade-3 bg-shade-0/50 flex flex-col gap-3 rounded-2xl border p-3">
				{#if stage >= 1}
					<div class="flex justify-end" in:fly={{ y: 8, duration: 300, easing: cubicOut }}>
						<p
							class="bg-accent/10 text-active max-w-[88%] rounded-2xl rounded-br-sm px-3 py-2 text-xs leading-relaxed"
						>
							{#each replies as persona (persona.id)}
								<span class="text-accent mr-1 font-medium">@{persona.name}</span>
							{/each}
							{$LL.tourAsk()}
						</p>
					</div>
				{/if}

				{#each replies as persona, i (persona.id)}
					{#if stage >= i * 2 + 2}
						<div
							class="flex items-end gap-2.5"
							in:fly={{ x: -14, y: 8, duration: 320, easing: cubicOut }}
						>
							<PersonaAvatar persona={tourAvatar(persona)} size={32} />
							<div class="min-w-0 flex-1">
								<span class="text-muted mb-0.5 block pl-1 text-[11px] font-medium">
									{persona.name}
								</span>
								<p
									class="border-shade-3 bg-shade-0 text-active inline-block max-w-full rounded-2xl rounded-bl-sm border px-3 py-2 text-xs leading-relaxed"
								>
									{#if stage >= i * 2 + 3}
										{persona.says}
									{:else}
										<span class="flex items-center gap-1 py-1" aria-label={$LL.tourThinking()}>
											{#each [0, 1, 2] as dot (dot)}
												<span
													class="typing-dot bg-muted h-1.5 w-1.5 rounded-full"
													style="animation-delay:{dot * 0.16}s"
												></span>
											{/each}
										</span>
									{/if}
								</p>
							</div>
						</div>
					{/if}
				{/each}
			</div>
		</div>
	{:else if step === 4}
		<!-- 5. The rest of the library -->
		<div class="flex flex-col gap-4">
			<div class="flex flex-col items-center gap-2 text-center">
				<div class="bg-accent/10 flex h-11 w-11 items-center justify-center rounded-full">
					<Library class="text-accent h-5 w-5" />
				</div>
				<h2 class="text-lg font-semibold tracking-tight">{$LL.tourLibraryTitle()}</h2>
				<p class="text-muted mx-auto max-w-sm text-sm leading-relaxed">
					{$LL.tourLibraryBody()}
				</p>
			</div>

			<!-- Each one shown as the thing it is rather than described: a playbook is a
			     short numbered procedure, so it is drawn as one, and knowledge is a few
			     named pieces of text, so it is drawn as those. Two cards side by side
			     from `sm` up, stacked below it, because at a phone's width two columns
			     of this would be two columns of nothing. -->
			<div class="grid gap-3 sm:grid-cols-2">
				<div class="border-shade-3 bg-shade-0/50 flex flex-col gap-2.5 rounded-2xl border p-3.5">
					<div class="flex items-center gap-2">
						<ListChecks class="text-accent h-4 w-4 shrink-0" />
						<span class="text-active text-sm font-medium">{$LL.tourPlaybooksName()}</span>
					</div>
					<ol class="flex flex-col gap-1.5">
						{#each [$LL.tourPlaybookStep1(), $LL.tourPlaybookStep2(), $LL.tourPlaybookStep3()] as line, i (line)}
							<li
								class="text-muted flex items-center gap-2 text-[11px] leading-snug"
								in:fly={{ y: 8, duration: 300, delay: 120 * i, easing: cubicOut }}
							>
								<span
									class="bg-accent/10 text-accent flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[9px] font-medium tabular-nums"
								>
									{i + 1}
								</span>
								{line}
							</li>
						{/each}
					</ol>
					<p class="text-muted text-[11px] leading-snug">{$LL.tourPlaybooksBody()}</p>
				</div>

				<div class="border-shade-3 bg-shade-0/50 flex flex-col gap-2.5 rounded-2xl border p-3.5">
					<div class="flex items-center gap-2">
						<FileText class="text-accent h-4 w-4 shrink-0" />
						<span class="text-active text-sm font-medium">{$LL.tourKnowledgeName()}</span>
					</div>
					<div class="flex flex-wrap gap-1.5">
						{#each [$LL.tourKnowledgeItem1(), $LL.tourKnowledgeItem2(), $LL.tourKnowledgeItem3()] as name, i (name)}
							<span
								class="border-shade-3 bg-shade-0 text-active flex items-center gap-1 rounded-lg border px-2 py-1 text-[11px] shadow-sm"
								in:fly={{ y: 8, duration: 300, delay: 120 * i, easing: cubicOut }}
							>
								<FileText class="text-muted h-3 w-3 shrink-0" />
								{name}
							</span>
						{/each}
					</div>
					<p class="text-muted text-[11px] leading-snug">{$LL.tourKnowledgeBody()}</p>
				</div>
			</div>
		</div>
	{:else if step === 5}
		<!-- 6. Drawing, where the instance allows it -->
		<div class="flex flex-col gap-4">
			<div class="flex flex-col items-center gap-2 text-center">
				<div class="bg-accent/10 flex h-11 w-11 items-center justify-center rounded-full">
					<ImageIcon class="text-accent h-5 w-5" />
				</div>
				<h2 class="text-lg font-semibold tracking-tight">{$LL.tourImagesTitle()}</h2>
				<p class="text-muted mx-auto max-w-sm text-sm leading-relaxed">
					{$LL.tourImagesBody()}
				</p>
			</div>

			<!-- A gallery filling in, played rather than described: the same shapes the
			     page shows while it is drawing, then the pictures landing one by one.
			     Nothing is fetched — these are the app's own accent, not photographs. -->
			<div class="grid grid-cols-3 gap-2">
				{#each tileImages as image, tile (tile)}
					<div
						class="tour-tile border-shade-3 from-accent/25 to-accent/5 relative aspect-square overflow-hidden rounded-xl border bg-gradient-to-br"
						style="animation-delay:{tile * TILE_STAGGER_MS}ms"
					>
						<!-- Keyed on the picture, so a change replaces this element rather than
						     editing it, and the two overlap while they trade places. Stacked
						     absolutely for that reason: a cross-fade needs both on screen at once,
						     and a tile that empties out first is the flicker this exists to avoid.

						     Decorative, and the empty alt is deliberate: they are examples of what
						     the feature makes, and the paragraph above has already said so. Six
						     descriptions of six pictures would be six things for a screen reader to
						     read out before the sentence that matters. -->
						{#key image}
							<img
								src={TOUR_IMAGES[image]}
								alt=""
								transition:fade={{ duration: SWAP_FADE_MS }}
								class="absolute inset-0 h-full w-full object-cover"
							/>
						{/key}
					</div>
				{/each}
			</div>
		</div>
	{/if}

	<!-- The way out lives on whichever step is last, and which one that is depends
	     on the instance. Rendered here rather than inside a step so there is one of
	     it however the tour is composed. -->
	{#if step === TOTAL_STEPS - 1}
		<Button class="mt-4 w-full" onclick={finish}>{$LL.tourStart()}</Button>
	{/if}
</OnboardingDialog>

<style lang="postcss">
	/* One path, taken at four different speeds and picked up mid-way by a negative
	   delay, which is enough for four of them never to agree. `translate` rather
	   than a transform, so nothing here fights a transition set in a class. */
	.tour-drift {
		animation-name: tour-drift;
		animation-timing-function: ease-in-out;
		animation-iteration-count: infinite;
		animation-direction: alternate;
	}

	@keyframes tour-drift {
		0% {
			translate: 0 0;
		}
		25% {
			translate: 7px -6px;
		}
		50% {
			translate: -5px -9px;
		}
		75% {
			translate: -8px 4px;
		}
		100% {
			translate: 4px 7px;
		}
	}

	/* A gallery filling in: each tile waits, fades up, and stays. The delay is set
	   per tile inline, so six of them arrive as a sequence rather than together.

	   Once, not on a loop. Looping it meant all six fading out and back in for ever,
	   which reads as a grid blinking rather than as pictures arriving, and it fought
	   the one thing this step is trying to show. After the entrance only a single
	   picture changes at a time, cross-faded inside its own tile.

	   `backwards` so the delay is spent invisible, rather than spent showing the
	   tile it is about to fade in. */
	.tour-tile {
		animation: tour-tile 500ms ease-out backwards;
	}

	@keyframes tour-tile {
		from {
			opacity: 0;
			scale: 0.9;
		}
		to {
			opacity: 1;
			scale: 1;
		}
	}

	/* The pause before an answer, drawn the way the conversation itself draws it. */
	.typing-dot {
		animation: typing-dot 1.2s ease-in-out infinite;
	}

	@keyframes typing-dot {
		0%,
		60%,
		100% {
			opacity: 0.3;
			translate: 0 0;
		}
		30% {
			opacity: 0.9;
			translate: 0 -2px;
		}
	}

	/* A loop that never stops is the first thing someone turns off. */
	@media (prefers-reduced-motion: reduce) {
		.tour-drift,
		.typing-dot,
		.tour-tile {
			animation: none;
		}

		/* Nothing to give back: with the animation off, `backwards` never applies and
		   the tiles simply are where they end up. The pictures stop changing too, in
		   the effect that schedules them. */
	}
</style>
