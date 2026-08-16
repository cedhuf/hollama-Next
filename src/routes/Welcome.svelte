<script lang="ts">
	import { ArrowLeft, ArrowRight, MessagesSquare, Palette, Sparkles } from '@lucide/svelte';
	import { cubicOut } from 'svelte/easing';
	import { fly } from 'svelte/transition';

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

	const showcase = $derived(
		$catalogState.status === 'ready'
			? $catalogState.catalog.entries.slice(0, 3).map((entry) => ({
					id: entry.id,
					name: entry.name,
					line: entry.tagline,
					...avatarFields(entry.avatar, entry.name)
				}))
			: []
	);

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
					A persona is a character with its own voice and expertise, and its own ongoing
					conversation. A few of them, to give you the idea.
				</p>
			</div>

			<!-- Bubbles rather than rows, because that is what a persona actually is:
			     someone who says something. They arrive one after another, from the side
			     the speaker is on, which reads as a conversation filling up rather than a
			     list rendering. Each carries its own greeting, so what lands on screen is
			     the persona's own voice rather than a description of it. -->
			<!-- Bubbles rather than rows, because that is what a persona is: someone who
			     says something. They arrive one after another, and each avatar keeps
			     breathing afterwards, so the step is alive while it is read rather than
			     animated once and then still. The float is tiny and slow on purpose: at
			     this size anything larger reads as a glitch, not as life. -->
			{#if showcase.length}
				<div class="flex flex-col gap-3">
					{#each showcase as persona, i (persona.id)}
						<div
							class="flex items-end gap-2.5"
							in:fly={{ x: -14, y: 8, duration: 340, delay: 160 * i, easing: cubicOut }}
						>
							<!-- The halo takes the persona's own colour, so three of them together
							     read as three characters rather than three cards. -->
							<span class="persona-bob relative shrink-0" style="animation-delay:{i * 0.7}s">
								<span
									class="persona-halo absolute inset-0 rounded-full"
									style="background-color:{persona.avatarColor};animation-delay:{i * 0.7}s"
								></span>
								<PersonaAvatar {persona} size={34} />
							</span>

							<div class="min-w-0 flex-1">
								<span class="mb-0.5 block pl-1 text-[11px] font-medium text-muted">
									{persona.name}
								</span>
								<!-- A tail on the corner nearest its avatar, which is the whole of what
								     makes a rounded box read as speech. -->
								<p
									class="rounded-2xl rounded-bl-sm border border-shade-3 bg-shade-0 px-3 py-2 text-xs leading-relaxed text-active"
								>
									{persona.line}
								</p>
							</div>
						</div>
					{/each}
				</div>

				<p class="text-center text-xs text-muted">
					More of them live in the <strong class="font-medium text-active">Library</strong>, under
					<strong class="font-medium text-active">Persona store</strong>. Install the ones you like.
				</p>
			{:else}
				<div
					class="flex flex-col items-center gap-2 rounded-xl border border-dashed border-shade-4 p-6 text-center"
				>
					<MessagesSquare class="h-5 w-5 text-muted" />
					<p class="text-sm text-muted">
						The store could not be reached just now. You can chat normally without one, and the
						Library will offer them as soon as it can read it.
					</p>
				</div>
			{/if}

			<Button class="w-full" onclick={finish}>Start chatting</Button>
		</div>
	{/if}
</OnboardingDialog>

<style lang="postcss">
	/* Two motions, deliberately out of step with each other: the avatar drifts, the
	   halo breathes, and neither loop divides the other, so three of them side by
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

	/* A loop that never stops is the first thing someone turns off. */
	@media (prefers-reduced-motion: reduce) {
		.persona-bob,
		.persona-halo {
			animation: none;
		}
	}
</style>
