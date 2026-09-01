<script lang="ts">
	import {
		ArrowLeft,
		ArrowRight,
		AtSign,
		FileText,
		Gauge,
		ImageIcon,
		Library,
		ListChecks,
		Palette,
		Plug,
		Sparkles,
		Upload,
		UserRound
	} from '@lucide/svelte';
	import { cubicOut } from 'svelte/easing';
	import { fade, fly } from 'svelte/transition';

	import LL from '$i18n/i18n-svelte';
	import { APP_NAME } from '$lib/brand';
	import Allowance from '$lib/components/Allowance.svelte';
	import Button from '$lib/components/Button.svelte';
	import Logo from '$lib/components/Logo.svelte';
	import OnboardingDialog from '$lib/components/OnboardingDialog.svelte';
	import PersonaAvatar from '$lib/components/PersonaAvatar.svelte';
	import ThemePicker from '$lib/components/ThemePicker.svelte';
	import { applyBackupToStores } from '$lib/data/applyBackup';
	import { canDrawImages } from '$lib/images';
	import { serversStore, settingsStore } from '$lib/localStorage';
	import { catalogState, loadCatalog } from '$lib/personaCatalog';
	import { currentRole } from '$lib/stores/auth';
	import { instanceConfig } from '$lib/stores/instance';
	import { welcomeOpen, welcomeShowAll } from '$lib/stores/modal';
	import { toast } from '$lib/toast';
	import { TOUR_CAST, TOUR_TURN, tourAvatar, tourPersona } from '$lib/tourCast';

	import Profile from './settings/Profile.svelte';
	import ServerConnections from './settings/ServerConnections.svelte';

	/** The tour shown once on a first connection. It configures nothing mandatory: the account already exists, so this is an introduction. */
	let step = $state(0);

	/**
	 * The tour is a list of named steps, composed for the person in front of it.
	 *
	 * Named rather than numbered: two steps run animations keyed on which step is
	 * showing, and with plain indices inserting the setup steps ahead of them would
	 * start the wrong one. The dots at the foot count this list.
	 *
	 * **servers** only where the person can add one and none is reachable.
	 * **profile** only while there is no name on it. **images** only where the
	 * instance draws.
	 */
	const canManageServers = $derived($currentRole === 'admin' || !!$instanceConfig?.allowUserKeys);
	const needsServer = $derived($welcomeShowAll || (canManageServers && $serversStore.length === 0));
	/** On a shared instance somebody else pays for the models, which is a fact worth learning before the day it stops you. On a personal install there is no ceiling to describe. */
	const hasAllowance = $derived($welcomeShowAll || !!$instanceConfig?.accounts);

	const needsProfile = $derived(
		$welcomeShowAll ||
			(!$settingsStore.profileFirstName.trim() && !$settingsStore.profileLastName.trim())
	);

	const steps = $derived([
		'intro' as const,
		...(needsServer ? (['servers'] as const) : []),
		...(needsProfile ? (['profile'] as const) : []),
		...(hasAllowance ? (['allowance'] as const) : []),
		'theme' as const,
		'personas' as const,
		'mention' as const,
		'library' as const,
		...($canDrawImages || $welcomeShowAll ? (['images'] as const) : [])
	]);

	const current = $derived(steps[step] ?? 'intro');
	const TOTAL_STEPS = $derived(steps.length);

	/**
	 * Eleven pictures for six tiles: a tile takes the next one at the moment its
	 * own animation has it at zero opacity, so the grid keeps refilling and nobody
	 * sees a swap. Shipped with the app, square-cropped at build time, so a tile
	 * never upscales one.
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

	/** Eleven pictures for six tiles, so there are always five to choose from and this cannot spin. Without the skip a tile could be dealt its neighbour's picture. */
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
	 * One picture changes, then a while later one other.
	 *
	 * A single timer rather than one per tile, which makes "one at a time" a
	 * property of the code. The wait is irregular so the grid never settles into a
	 * rhythm, and the tile is picked at random, never the one that just changed.
	 *
	 * Nothing runs when the step is off screen, or for somebody who asked for less
	 * motion.
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
			// Any tile but the one that just changed, so the eye is never sent back to the
			// same corner twice running.
			const offset = 1 + Math.floor(Math.random() * (TILES - 1));
			const tile = last < 0 ? Math.floor(Math.random() * TILES) : (last + offset) % TILES;
			last = tile;
			tileImages[tile] = deal();
			queue();
		}

		// Not before the last tile has landed: a seventh thing happening while six are
		// still arriving.
		timer = setTimeout(queue, TILES * TILE_STAGGER_MS + SWAP_FADE_MS);

		return () => clearTimeout(timer);
	});

	/** Four drift, and a fifth turns up when the mention step calls for it. */
	const drifting = TOUR_CAST.slice(0, 4);

	/** Where each one sits before it wanders, and which side its bubble is on. Opposite sides on opposite halves, so nothing grows into anything else. */
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
	 * The store, asked once, for one line. The characters are written down in
	 * `tourCast`, so nothing here has to succeed; what the store adds is how many
	 * personas this instance actually has. Unreachable, the line is simply absent.
	 */
	$effect(() => {
		if (current === 'personas') void loadCatalog();
	});

	const storeCount = $derived(
		$catalogState.status === 'ready' ? $catalogState.catalog.entries.length : 0
	);

	/**
	 * How far the little conversation has got: 1 is what you typed, then each
	 * persona takes two beats, thinking and answering. One number rather than a flag
	 * per bubble, so the second persona cannot answer before the first.
	 *
	 * The beats are real: the pause is the pause a model takes, and the dots are the
	 * dots the conversation shows.
	 */
	let stage = $state(0);
	const finalStage = $derived(1 + replies.length * 2);

	$effect(() => {
		if (current !== 'mention') return;

		// Someone who asked for less motion asked for less motion, not for a slower
		// version of it: the whole thread is already there.
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

	/** Backups carry the profile, the connections and the conversations, so a restored instance has nothing left for the tour to ask. */
	let fileInput: HTMLInputElement | undefined = $state();

	const isFreshInstall = $derived(
		$welcomeShowAll || ($serversStore.length === 0 && !$settingsStore.profileFirstName.trim())
	);

	function restoreFromBackup(event: Event) {
		const input = event.target as HTMLInputElement;
		if (!input.files || input.files.length === 0) return;

		const reader = new FileReader();
		reader.onload = (e) => {
			try {
				applyBackupToStores(JSON.parse(e.target?.result as string));
				toast.success($LL.importSuccess());
				finish();
			} catch (error) {
				console.error(error);
				toast.error($LL.importError(), {
					description: error instanceof Error ? error.message : 'Unknown error'
				});
			}
		};
		reader.readAsText(input.files[0]);
	}

	function finish() {
		$welcomeShowAll = false;
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
	{#if current === 'intro'}
		<!-- 1. Who we are -->
		<div class="flex flex-col items-center gap-4 py-6 text-center">
			<Logo class="h-16 w-16" />
			<div class="flex flex-col gap-1.5">
				<h2 class="text-xl font-semibold tracking-tight">{APP_NAME}</h2>
				<p class="text-muted mx-auto max-w-xs text-sm leading-relaxed">
					{$LL.tourIntro()}
				</p>
			</div>

			{#if isFreshInstall}
				<!-- The way past the whole tour, for somebody who has been through it
				     elsewhere. Offered only on an install with nothing in it. -->
				<button
					type="button"
					onclick={() => fileInput?.click()}
					class="text-muted hover:bg-shade-2 hover:text-active flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm transition-colors"
				>
					<Upload class="h-4 w-4" />
					{$LL.tourRestoreBackup()}
				</button>
				<input
					bind:this={fileInput}
					type="file"
					accept="application/json"
					class="hidden"
					onchange={restoreFromBackup}
				/>
			{/if}
		</div>
	{:else if current === 'servers'}
		<!-- The one step that configures rather than introduces: without a connection
		     nothing else can be tried. Absent for anyone who has one or cannot add one. -->
		<div class="flex flex-col gap-3">
			<div class="flex flex-col items-center gap-2 text-center">
				<div class="bg-accent/10 flex h-11 w-11 items-center justify-center rounded-full">
					<Plug class="text-accent h-5 w-5" />
				</div>
				<h2 class="text-lg font-semibold tracking-tight">{$LL.tourServersTitle()}</h2>
				<p class="text-muted mx-auto max-w-sm text-sm leading-relaxed">
					{$LL.tourServersBody()}
				</p>
			</div>
			<ServerConnections />
		</div>
	{:else if current === 'profile'}
		<div class="flex flex-col gap-3">
			<div class="flex flex-col items-center gap-2 text-center">
				<div class="bg-accent/10 flex h-11 w-11 items-center justify-center rounded-full">
					<UserRound class="text-accent h-5 w-5" />
				</div>
				<h2 class="text-lg font-semibold tracking-tight">{$LL.tourProfileTitle()}</h2>
				<p class="text-muted mx-auto max-w-sm text-sm leading-relaxed">
					{$LL.tourProfileBody()}
				</p>
			</div>
			<Profile showUsage={false} />
		</div>
	{:else if current === 'allowance'}
		<!-- The one step about money, said in a number: on a shared instance somebody
		     else pays, which people otherwise discover the day it runs out. -->
		<div class="flex flex-col gap-4">
			<div class="flex flex-col items-center gap-2 text-center">
				<div class="bg-accent/10 flex h-11 w-11 items-center justify-center rounded-full">
					<Gauge class="text-accent h-5 w-5" />
				</div>
				<h2 class="text-lg font-semibold tracking-tight">{$LL.tourAllowanceTitle()}</h2>
			</div>

			<Allowance />
		</div>
	{:else if current === 'theme'}
		<!-- 2. Make it yours: applies live, saved as you click -->
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
	{:else if current === 'personas'}
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
		     table of contents and these are meant to read as people. The paths are long,
		     slow and out of phase, so the group never falls into step. -->
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
							<!-- A tail on the corner nearest its face, which is what makes a rounded box
							     read as speech rather than as a chip. -->
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
	{:else if current === 'mention'}
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

			<!-- The step plays the feature instead of describing it. -->
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
	{:else if current === 'library'}
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

			<!-- Each one drawn as the thing it is rather than described. Two cards side by
		     side from `sm` up, stacked below it, where two columns would be two columns
		     of nothing. -->
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
	{:else if current === 'images'}
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

			<!-- A gallery filling in, played rather than described. Nothing is fetched:
		     these are the app's own accent, not photographs. -->
			<div class="grid grid-cols-3 gap-2">
				{#each tileImages as image, tile (tile)}
					<div
						class="tour-tile border-shade-3 from-accent/25 to-accent/5 relative aspect-square overflow-hidden rounded-xl border bg-gradient-to-br"
						style="animation-delay:{tile * TILE_STAGGER_MS}ms"
					>
						<!-- Keyed on the picture, so a change replaces this element rather than editing
						     it, and the two overlap while they trade places. Stacked absolutely, because
						     a cross-fade needs both on screen at once.

						     Decorative, and the empty alt is deliberate: the paragraph above has already
						     said what they are. -->
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

	<!-- The way out lives on whichever step is last, which depends on the instance.
	     Rendered here so there is one of it however the tour is composed. -->
	{#if step === TOTAL_STEPS - 1}
		<Button class="mt-4 w-full" onclick={finish}>{$LL.tourStart()}</Button>
	{/if}
</OnboardingDialog>

<style lang="postcss">
	/* One path at four different speeds, picked up mid-way by a negative delay,
	   which is enough for four of them never to agree. `translate` rather than a
	   transform, so nothing here fights a transition set in a class. */
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

	/* A gallery filling in: each tile waits, fades up, and stays, with the delay set
	   per tile inline so they arrive as a sequence.

	   Once, not on a loop: looping meant all six fading out and back in for ever,
	   which reads as a grid blinking. `backwards` so the delay is spent invisible
	   rather than showing the tile it is about to fade in. */
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

		/* Nothing to give back: with the animation off, `backwards` never applies.
		   The pictures stop changing too, in the effect that schedules them. */
	}
</style>
