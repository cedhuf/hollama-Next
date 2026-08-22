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
				<p class="mx-auto max-w-xs text-sm leading-relaxed text-muted">
					{$LL.tourIntro()}
				</p>
			</div>
		</div>
	{:else if step === 1}
		<!-- 2. Make it yours — applies live, saved as you click -->
		<div class="flex flex-col gap-4">
			<div class="flex flex-col items-center gap-2 pb-1 text-center">
				<div class="flex h-11 w-11 items-center justify-center rounded-full bg-accent/10">
					<Palette class="h-5 w-5 text-accent" />
				</div>
				<h2 class="text-lg font-semibold tracking-tight">{$LL.tourThemeTitle()}</h2>
				<p class="text-sm text-muted">{$LL.tourThemeBody()}</p>
			</div>
			<ThemePicker />
		</div>
	{:else if step === 2}
		<!-- 3. Who you can talk to -->
		<div class="flex flex-col gap-3">
			<div class="flex flex-col items-center gap-2 text-center">
				<div class="flex h-11 w-11 items-center justify-center rounded-full bg-accent/10">
					<Sparkles class="h-5 w-5 text-accent" />
				</div>
				<h2 class="text-lg font-semibold tracking-tight">{$LL.tourPersonasTitle()}</h2>
				<p class="mx-auto max-w-sm text-sm leading-relaxed text-muted">
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
							<span class="mb-0.5 block px-1 text-[10px] font-medium text-muted">
								{persona.name}
							</span>
							<!-- A tail on the corner nearest its face, which is the whole of what
							     makes a rounded box read as speech rather than as a chip. -->
							<p
								class="rounded-2xl border border-shade-3 bg-shade-0 px-2.5 py-1.5 text-[11px] leading-snug text-active shadow-sm {SLOTS[
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
				<p class="text-center text-xs text-muted" in:fade={{ duration: 240 }}>
					{$LL.tourStoreCount({ count: storeCount })}
				</p>
			{/if}
		</div>
	{:else if step === 3}
		<!-- 4. Calling one into a conversation -->
		<div class="flex flex-col gap-4">
			<div class="flex flex-col items-center gap-2 text-center">
				<div class="flex h-11 w-11 items-center justify-center rounded-full bg-accent/10">
					<AtSign class="h-5 w-5 text-accent" />
				</div>
				<h2 class="text-lg font-semibold tracking-tight">{$LL.tourMentionTitle()}</h2>
				<p class="mx-auto max-w-sm text-sm leading-relaxed text-muted">
					{$LL.tourMentionBody()}
				</p>
			</div>

			<!-- The step plays the feature instead of describing it: a message with two
			     names in it, then two answers arriving one after the other. -->
			<div class="flex flex-col gap-3 rounded-2xl border border-shade-3 bg-shade-0/50 p-3">
				{#if stage >= 1}
					<div class="flex justify-end" in:fly={{ y: 8, duration: 300, easing: cubicOut }}>
						<p
							class="max-w-[88%] rounded-2xl rounded-br-sm bg-accent/10 px-3 py-2 text-xs leading-relaxed text-active"
						>
							{#each replies as persona (persona.id)}
								<span class="mr-1 font-medium text-accent">@{persona.name}</span>
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
								<span class="mb-0.5 block pl-1 text-[11px] font-medium text-muted">
									{persona.name}
								</span>
								<p
									class="inline-block max-w-full rounded-2xl rounded-bl-sm border border-shade-3 bg-shade-0 px-3 py-2 text-xs leading-relaxed text-active"
								>
									{#if stage >= i * 2 + 3}
										{persona.says}
									{:else}
										<span class="flex items-center gap-1 py-1" aria-label={$LL.tourThinking()}>
											{#each [0, 1, 2] as dot (dot)}
												<span
													class="typing-dot h-1.5 w-1.5 rounded-full bg-muted"
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
				<div class="flex h-11 w-11 items-center justify-center rounded-full bg-accent/10">
					<Library class="h-5 w-5 text-accent" />
				</div>
				<h2 class="text-lg font-semibold tracking-tight">{$LL.tourLibraryTitle()}</h2>
				<p class="mx-auto max-w-sm text-sm leading-relaxed text-muted">
					{$LL.tourLibraryBody()}
				</p>
			</div>

			<!-- Each one shown as the thing it is rather than described: a playbook is a
			     short numbered procedure, so it is drawn as one, and knowledge is a few
			     named pieces of text, so it is drawn as those. Two cards side by side
			     from `sm` up, stacked below it, because at a phone's width two columns
			     of this would be two columns of nothing. -->
			<div class="grid gap-3 sm:grid-cols-2">
				<div class="flex flex-col gap-2.5 rounded-2xl border border-shade-3 bg-shade-0/50 p-3.5">
					<div class="flex items-center gap-2">
						<ListChecks class="h-4 w-4 shrink-0 text-accent" />
						<span class="text-sm font-medium text-active">{$LL.tourPlaybooksName()}</span>
					</div>
					<ol class="flex flex-col gap-1.5">
						{#each [$LL.tourPlaybookStep1(), $LL.tourPlaybookStep2(), $LL.tourPlaybookStep3()] as line, i (line)}
							<li
								class="flex items-center gap-2 text-[11px] leading-snug text-muted"
								in:fly={{ y: 8, duration: 300, delay: 120 * i, easing: cubicOut }}
							>
								<span
									class="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-accent/10 text-[9px] font-medium tabular-nums text-accent"
								>
									{i + 1}
								</span>
								{line}
							</li>
						{/each}
					</ol>
					<p class="text-[11px] leading-snug text-muted">{$LL.tourPlaybooksBody()}</p>
				</div>

				<div class="flex flex-col gap-2.5 rounded-2xl border border-shade-3 bg-shade-0/50 p-3.5">
					<div class="flex items-center gap-2">
						<FileText class="h-4 w-4 shrink-0 text-accent" />
						<span class="text-sm font-medium text-active">{$LL.tourKnowledgeName()}</span>
					</div>
					<div class="flex flex-wrap gap-1.5">
						{#each [$LL.tourKnowledgeItem1(), $LL.tourKnowledgeItem2(), $LL.tourKnowledgeItem3()] as name, i (name)}
							<span
								class="flex items-center gap-1 rounded-lg border border-shade-3 bg-shade-0 px-2 py-1 text-[11px] text-active shadow-sm"
								in:fly={{ y: 8, duration: 300, delay: 120 * i, easing: cubicOut }}
							>
								<FileText class="h-3 w-3 shrink-0 text-muted" />
								{name}
							</span>
						{/each}
					</div>
					<p class="text-[11px] leading-snug text-muted">{$LL.tourKnowledgeBody()}</p>
				</div>
			</div>
		</div>
	{:else if step === 5}
		<!-- 6. Drawing, where the instance allows it -->
		<div class="flex flex-col gap-4">
			<div class="flex flex-col items-center gap-2 text-center">
				<div class="flex h-11 w-11 items-center justify-center rounded-full bg-accent/10">
					<ImageIcon class="h-5 w-5 text-accent" />
				</div>
				<h2 class="text-lg font-semibold tracking-tight">{$LL.tourImagesTitle()}</h2>
				<p class="mx-auto max-w-sm text-sm leading-relaxed text-muted">
					{$LL.tourImagesBody()}
				</p>
			</div>

			<!-- A gallery filling in, played rather than described: the same shapes the
			     page shows while it is drawing, then the pictures landing one by one.
			     Nothing is fetched — these are the app's own accent, not photographs. -->
			<div class="grid grid-cols-3 gap-2">
				{#each [0, 1, 2, 3, 4, 5] as tile (tile)}
					<div
						class="tour-tile aspect-square rounded-xl border border-shade-3 bg-gradient-to-br from-accent/25 to-accent/5"
						style="animation-delay:{tile * 170}ms"
					></div>
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
	   per tile inline, so six of them arrive as a sequence rather than together. */
	.tour-tile {
		animation: tour-tile 2.6s ease-out infinite;
		opacity: 0;
	}

	@keyframes tour-tile {
		0% {
			opacity: 0;
			scale: 0.9;
		}
		18%,
		78% {
			opacity: 1;
			scale: 1;
		}
		100% {
			opacity: 0;
			scale: 0.96;
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

		/* The tiles start invisible so they can fade up. With the animation off there
		   is nothing to fade them in, so they have to be given back. */
		.tour-tile {
			opacity: 1;
		}
	}
</style>
