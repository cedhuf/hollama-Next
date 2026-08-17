<script lang="ts">
	import { ArrowLeft, ArrowRight, MessagesSquare, Palette, Sparkles } from '@lucide/svelte';
	import { cubicOut } from 'svelte/easing';
	import { fade, fly } from 'svelte/transition';

	import { APP_NAME } from '$lib/brand';
	import Button from '$lib/components/Button.svelte';
	import Logo from '$lib/components/Logo.svelte';
	import OnboardingDialog from '$lib/components/OnboardingDialog.svelte';
	import PersonaAvatar from '$lib/components/PersonaAvatar.svelte';
	import ThemePicker from '$lib/components/ThemePicker.svelte';
	import { settingsStore } from '$lib/localStorage';
	import { avatarFields } from '$lib/personaBundle';
	import { catalogState, loadCatalog } from '$lib/personaCatalog';
	import { instanceConfig } from '$lib/stores/instance';
	import { welcomeOpen } from '$lib/stores/modal';

	/**
	 * The welcome tour shown once on a user's first connection (server mode). Unlike
	 * the local-mode wizard it configures nothing mandatory: the account already
	 * exists and its profile comes from the identity provider, so this is an
	 * introduction — what the app is, how it can look, and who you can talk to.
	 */
	let step = $state(0);

	const TOTAL_STEPS = 3;

	/**
	 * A handful to showcase, from the store and only from the store.
	 *
	 * Nothing is installed for anyone any more, so on a first connection the
	 * library is empty by construction and a tour built on it had nothing to show.
	 * It was briefly built on the library anyway, falling back to the store, which
	 * was worse than either: on an account that already had personas the tour
	 * introduced the app with whatever that person happened to have made, presented
	 * as if it were the app's own suggestion.
	 *
	 * This step is an introduction to the store. So it shows the store.
	 */
	$effect(() => {
		if (step === 2) void loadCatalog();
	});

	const cast = $derived(
		$catalogState.status === 'ready'
			? $catalogState.catalog.entries.map((entry) => ({
					id: entry.id,
					name: entry.name,
					line: entry.tagline,
					...avatarFields(entry.avatar, entry.name)
				}))
			: []
	);

	/**
	 * Two speak, the rest wait in the store.
	 *
	 * Two rather than three because what the step demonstrates is a mention turn,
	 * and a mention turn's whole point is legible with two: you name them, they
	 * answer one after the other, each under its own name. A third repeats the
	 * lesson and costs a beat and a half of someone's attention on the way to the
	 * button. The others are better spent as a row of faces saying how many more
	 * there are.
	 */
	const speakers = $derived(cast.slice(0, 2));
	const stack = $derived(cast.slice(speakers.length, speakers.length + 5));
	const waiting = $derived(Math.max(cast.length - speakers.length, 0));

	/**
	 * Only a listing that actually failed says so.
	 *
	 * The step used to show the "could not be reached" panel for as long as the
	 * fetch took, because the absence of entries was read as a failure. On a first
	 * connection that is the normal case for a second or two, and telling someone
	 * their store is unreachable and then quietly contradicting yourself is worse
	 * than showing nothing.
	 */
	const failed = $derived($catalogState.status === 'error');

	/**
	 * How far the little conversation has got.
	 *
	 * 1 is what you typed, then each persona takes two beats (thinking, then
	 * answering), and the last stage is the store. A stage counter rather than a
	 * flag per bubble because the thing being played is a sequence, and a sequence
	 * with one number in it cannot get into a state where the second persona has
	 * answered before the first.
	 *
	 * The beats are real ones: the pause before an answer is the pause a model
	 * actually takes, and the dots during it are the dots the composer shows. The
	 * step is a small honest replay of a turn, not a cartoon of one.
	 */
	let stage = $state(0);
	const finalStage = $derived(2 + speakers.length * 2);

	$effect(() => {
		if (step !== 2 || speakers.length === 0) return;

		// Someone who asked for less motion asked for less motion, not for a slower
		// version of it: the whole thread is simply already there.
		if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
			stage = finalStage;
			return;
		}

		stage = 1;
		const timers: ReturnType<typeof setTimeout>[] = [];
		let at = 0;
		for (let i = 0; i < speakers.length; i++) {
			at += 560;
			timers.push(setTimeout(() => (stage = i * 2 + 2), at));
			at += 880;
			timers.push(setTimeout(() => (stage = i * 2 + 3), at));
		}
		at += 420;
		timers.push(setTimeout(() => (stage = finalStage), at));

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
		<!-- 3. Personas -->
		<div class="flex flex-col gap-4">
			<div class="flex flex-col items-center gap-2 text-center">
				<div class="flex h-11 w-11 items-center justify-center rounded-full bg-accent/10">
					<Sparkles class="h-5 w-5 text-accent" />
				</div>
				<h2 class="text-lg font-semibold tracking-tight">Meet your personas</h2>
				<p class="mx-auto max-w-sm text-sm leading-relaxed text-muted">
					A persona is a character with its own voice, its own expertise, and its own ongoing
					conversation. Type <span class="font-medium text-accent">@</span> to call one into any chat,
					or name several and let them answer in turn.
				</p>
			</div>

			<!-- The step plays the feature instead of describing it: a message with two
			     names in it, then two answers arriving one after the other, each under
			     its own face. Bubbles rather than rows, because that is what a persona
			     is: someone who says something. -->
			{#if speakers.length}
				<div class="flex flex-col gap-3 rounded-2xl border border-shade-3 bg-shade-0/50 p-3">
					{#if stage >= 1}
						<div class="flex justify-end" in:fly={{ y: 8, duration: 300, easing: cubicOut }}>
							<p
								class="max-w-[85%] rounded-2xl rounded-br-sm bg-accent/10 px-3 py-2 text-xs leading-relaxed text-active"
							>
								{#each speakers as persona (persona.id)}
									<span class="mr-1 font-medium text-accent">@{persona.name}</span>
								{/each}
								who are you two?
							</p>
						</div>
					{/if}

					{#each speakers as persona, i (persona.id)}
						{#if stage >= i * 2 + 2}
							<div
								class="flex items-end gap-2.5"
								in:fly={{ x: -14, y: 8, duration: 320, easing: cubicOut }}
							>
								<!-- The halo takes the persona's own colour, so two of them together
								     read as two characters rather than two cards. Both loops keep
								     running once the answer has landed, so the step is alive while it
								     is read rather than animated once and then still. -->
								<span class="persona-bob relative shrink-0" style="animation-delay:{i * 0.7}s">
									<span
										class="persona-halo absolute inset-0 rounded-full"
										style="background-color:{persona.avatarColor};animation-delay:{i * 0.7}s"
									></span>
									<PersonaAvatar {persona} size={32} />
								</span>

								<div class="min-w-0 flex-1">
									<span class="mb-0.5 block pl-1 text-[11px] font-medium text-muted">
										{persona.name}
									</span>
									<!-- A tail on the corner nearest its avatar, which is the whole of
									     what makes a rounded box read as speech. -->
									<p
										class="inline-block max-w-full rounded-2xl rounded-bl-sm border border-shade-3 bg-shade-0 px-3 py-2 text-xs leading-relaxed text-active"
									>
										{#if stage >= i * 2 + 3}
											{persona.line}
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

				{#if stage >= finalStage}
					<div
						class="flex flex-wrap items-center justify-center gap-x-2 gap-y-1.5 text-center text-xs text-muted"
						in:fade={{ duration: 260 }}
					>
						{#if stack.length}
							<span class="flex -space-x-2">
								{#each stack as persona, i (persona.id)}
									<span
										class="persona-join rounded-full ring-2 ring-shade-1"
										style="animation-delay:{i * 0.06}s"
									>
										<PersonaAvatar {persona} size={22} />
									</span>
								{/each}
							</span>
						{/if}
						<span>
							{#if waiting}
								{waiting} more in the
							{:else}
								More live in the
							{/if}
							<strong class="font-medium text-active">Persona store</strong>, and you can write your
							own.
						</span>
					</div>
				{/if}
			{:else if failed}
				<div
					class="flex flex-col items-center gap-2 rounded-xl border border-dashed border-shade-4 p-6 text-center"
				>
					<MessagesSquare class="h-5 w-5 text-muted" />
					<p class="text-sm text-muted">
						The store could not be reached just now. You can chat normally without one, and the
						Library will offer them as soon as it can read it.
					</p>
				</div>
			{:else}
				<!-- The thread's own shape while the listing is on its way, so the step
				     settles into place rather than jumping when it lands. -->
				<div
					class="flex animate-pulse flex-col gap-3 rounded-2xl border border-shade-3 bg-shade-0/50 p-3"
				>
					{#each [0, 1] as row (row)}
						<div class="flex items-end gap-2.5">
							<span class="h-8 w-8 shrink-0 rounded-full bg-shade-2"></span>
							<div class="flex min-w-0 flex-1 flex-col gap-1.5">
								<span class="h-2 w-16 rounded-full bg-shade-2"></span>
								<span
									class="h-8 rounded-2xl rounded-bl-sm bg-shade-2"
									style="width:{78 - row * 16}%"
								></span>
							</div>
						</div>
					{/each}
				</div>
			{/if}

			<Button class="w-full" onclick={finish}>Start chatting</Button>
		</div>
	{/if}
</OnboardingDialog>

<style lang="postcss">
	/* Two motions, deliberately out of step with each other: the avatar drifts, the
	   halo breathes, and neither loop divides the other, so two of them side by
	   side never fall into lockstep. Each row offsets both by its own delay. */
	.persona-bob {
		display: inline-flex;
		animation: persona-bob 4.2s ease-in-out infinite;
	}

	.persona-halo {
		animation: persona-halo 3.1s ease-in-out infinite;
		filter: blur(6px);
		opacity: 0.35;
	}

	@keyframes persona-bob {
		0%,
		100% {
			transform: translateY(0);
		}
		50% {
			transform: translateY(-3px);
		}
	}

	@keyframes persona-halo {
		0%,
		100% {
			transform: scale(0.9);
			opacity: 0.22;
		}
		50% {
			transform: scale(1.18);
			opacity: 0.42;
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
			transform: translateY(0);
		}
		30% {
			opacity: 0.9;
			transform: translateY(-2px);
		}
	}

	/* The faces still in the store arrive as a row rather than all at once, which
	   is the one place a stagger costs nothing: it happens after the reading. */
	.persona-join {
		display: inline-flex;
		animation: persona-join 320ms cubic-bezier(0.32, 0.72, 0, 1) backwards;
	}

	@keyframes persona-join {
		from {
			opacity: 0;
			transform: translateX(-6px) scale(0.8);
		}
	}

	/* A loop that never stops is the first thing someone turns off. */
	@media (prefers-reduced-motion: reduce) {
		.persona-bob,
		.persona-halo,
		.typing-dot,
		.persona-join {
			animation: none;
		}
	}
</style>
