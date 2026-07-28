<script lang="ts">
	import { ArrowLeft, ArrowRight, MessagesSquare, Palette, Sparkles } from '@lucide/svelte';
	import { fly } from 'svelte/transition';

	import Button from '$lib/components/Button.svelte';
	import OnboardingDialog from '$lib/components/OnboardingDialog.svelte';
	import PersonaAvatar from '$lib/components/PersonaAvatar.svelte';
	import ThemePicker from '$lib/components/ThemePicker.svelte';
	import { personasStore, settingsStore } from '$lib/localStorage';
	import { welcomeOpen } from '$lib/stores/modal';

	/**
	 * The welcome tour shown once on a user's first connection (server mode). Unlike
	 * the local-mode wizard it configures nothing mandatory: the account already
	 * exists and its profile comes from the identity provider, so this is an
	 * introduction — what the app is, how it can look, and who you can talk to.
	 */
	let step = $state(0);

	const TOTAL_STEPS = 3;

	/** A handful of personas to showcase; the rest live in the Library. */
	const showcase = $derived(($personasStore ?? []).slice(0, 6));

	function finish() {
		$settingsStore.welcomeComplete = true;
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
			<img class="logo-ink h-16 w-16" src="/logo-mark.png" alt="Hollama Next" />
			<div class="flex flex-col gap-1.5">
				<h2 class="text-xl font-semibold tracking-tight">Hollama Next</h2>
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
					Personas are characters with their own voice and expertise. Start a chat with one and pick
					up right where you left off.
				</p>
			</div>

			{#if showcase.length}
				<div class="flex flex-col gap-2">
					{#each showcase as persona, i (persona.id)}
						<div
							class="flex items-center gap-3 rounded-xl border border-shade-3 bg-shade-0 p-3"
							in:fly={{ y: 8, duration: 260, delay: 60 * i }}
						>
							<PersonaAvatar {persona} size={38} />
							<div class="flex min-w-0 flex-col">
								<span class="truncate text-sm font-medium text-active">{persona.name}</span>
								{#if persona.tagline}
									<span class="truncate text-xs text-muted">{persona.tagline}</span>
								{/if}
							</div>
						</div>
					{/each}
				</div>
			{:else}
				<div
					class="flex flex-col items-center gap-2 rounded-xl border border-dashed border-shade-4 p-6 text-center"
				>
					<MessagesSquare class="h-5 w-5 text-muted" />
					<p class="text-sm text-muted">
						None are shared with you yet — you can still chat normally, and any your administrator
						publishes will show up in the Library.
					</p>
				</div>
			{/if}

			<Button class="w-full" onclick={finish}>Start chatting</Button>
		</div>
	{/if}
</OnboardingDialog>
