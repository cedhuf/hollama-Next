<script lang="ts">
	import { ArrowLeft, ArrowRight, AtSign, Palette, Sparkles } from '@lucide/svelte';
	import { cubicOut } from 'svelte/easing';
	import { fade, fly } from 'svelte/transition';

	import { APP_NAME } from '$lib/brand';
	import Button from '$lib/components/Button.svelte';
	import Logo from '$lib/components/Logo.svelte';
	import OnboardingDialog from '$lib/components/OnboardingDialog.svelte';
	import ThemePicker from '$lib/components/ThemePicker.svelte';
	import TourFace from '$lib/components/TourFace.svelte';
	import { settingsStore } from '$lib/localStorage';
	import { catalogState, loadCatalog } from '$lib/personaCatalog';
	import { instanceConfig } from '$lib/stores/instance';
	import { welcomeOpen } from '$lib/stores/modal';
	import { TOUR_CAST, TOUR_TURN, tourPersona } from '$lib/tourCast';

	/**
	 * The welcome tour shown once on a user's first connection (server mode). Unlike
	 * the local-mode wizard it configures nothing mandatory: the account already
	 * exists and its profile comes from the identity provider, so this is an
	 * introduction — what the app is, how it can look, and who you can talk to.
	 */
	let step = $state(0);

	const TOTAL_STEPS = 4;

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

	const replies = TOUR_TURN.replies.map((reply) => ({
		...tourPersona(reply.id),
		says: reply.says
	}));

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
	const finalStage = 1 + replies.length * 2;

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
		Continue
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
					Your own space to think out loud with AI — private, fast, and shaped the way you like it.
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
				<h2 class="text-lg font-semibold tracking-tight">Make it yours</h2>
				<p class="text-sm text-muted">Pick a look — it applies instantly and is saved as you go.</p>
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
				<h2 class="text-lg font-semibold tracking-tight">Meet your personas</h2>
				<p class="mx-auto max-w-sm text-sm leading-relaxed text-muted">
					A persona is a character with its own voice and its own expertise, and it keeps its own
					ongoing conversation with you.
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
						<TourFace {persona} size={42} />
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
								{persona.line}
							</p>
						</div>
					</div>
				{/each}
			</div>

			{#if storeCount}
				<p class="text-center text-xs text-muted" in:fade={{ duration: 240 }}>
					{storeCount} of them in the
					<strong class="font-medium text-active">Persona store</strong>, and you can write your
					own.
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
				<h2 class="text-lg font-semibold tracking-tight">Call them into any chat</h2>
				<p class="mx-auto max-w-sm text-sm leading-relaxed text-muted">
					Type <span class="font-medium text-accent">@</span> and pick a name. Mention two and they answer
					in turn, each under its own, in the conversation you were already having.
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
							{TOUR_TURN.ask}
						</p>
					</div>
				{/if}

				{#each replies as persona, i (persona.id)}
					{#if stage >= i * 2 + 2}
						<div
							class="flex items-end gap-2.5"
							in:fly={{ x: -14, y: 8, duration: 320, easing: cubicOut }}
						>
							<TourFace {persona} size={32} />
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
										<span class="flex items-center gap-1 py-1" aria-label="Thinking">
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

			<Button class="w-full" onclick={finish}>Start chatting</Button>
		</div>
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
		.typing-dot {
			animation: none;
		}
	}
</style>
