<script lang="ts">
	import { Mic, MicOff, X } from '@lucide/svelte';
	import { onDestroy, onMount } from 'svelte';

	import LL from '$i18n/i18n-svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { SILENCE } from '$lib/audioReading';
	import { chatDefaultsConfig } from '$lib/chatDefaults';
	import PersonaAvatar from '$lib/components/PersonaAvatar.svelte';
	import { repository } from '$lib/data';
	import { personasStore, settingsStore } from '$lib/localStorage';
	import type { Persona } from '$lib/personas';
	import { settingsModalOpen } from '$lib/stores/modal';
	import { VoiceSession } from '$lib/voice/session.svelte';
	import VoiceBars from '$lib/voice/VoiceBars.svelte';

	import Orb from '../Orb.svelte';

	/**
	 * Talking to it, rather than typing at it.
	 *
	 * The whole screen, and deliberately almost empty: one thing is being done
	 * here, and every control that is not part of it is a control asking to be
	 * pressed by mistake while somebody is speaking.
	 *
	 * It is a conversation rather than a form, and it is one because the microphone
	 * stays open. You speak, it hears you stop, the turn runs, the answer is read
	 * back, and you can cut it off mid-sentence by simply talking. Nothing is
	 * tapped between one question and the next.
	 *
	 * Everything underneath is `VoiceSession`, which holds the socket, the two
	 * worklets and the microphone. This file draws, and it is the only file here
	 * that knows what the screen looks like. The turn itself runs on the server,
	 * through the same orchestrator a typed message uses, so an exchange held here
	 * is an ordinary conversation in the list afterwards.
	 *
	 * Two visuals, for two speakers. The orb is the voice answering; the bars at
	 * the foot are yours. Which of them is moving says whose turn it is from across
	 * a room, and no status text does that as quickly.
	 */
	const voice = new VoiceSession();

	/**
	 * The conversation to hold, when the screen was opened to hold a particular one.
	 *
	 * A persona on the home screen is a person to talk to, so tapping one arrives
	 * here with their conversation. Read once, on arrival: the screen holds one
	 * conversation for as long as it is open, and swapping it underneath somebody
	 * mid-sentence is not a feature.
	 */
	const given = page.url.searchParams.get('session');

	/** Whose voice this is, when it belongs to somebody. */
	let persona = $state<Persona | undefined>(undefined);

	onMount(async () => {
		if (!given) return;
		const stored = await repository.loadSession(given).catch(() => null);
		if (!stored?.personaId) return;
		persona = ($personasStore ?? []).find((entry) => entry.id === stored.personaId);
	});

	/** The conversation being written into, which is the one to go and read. */
	const conversation = $derived(voice.sessionId || given || '');

	/**
	 * What is happening, and it is the person's own state first.
	 *
	 * `voice.talking` is theirs and instant; everything else is the server's and
	 * arrives a moment later. Reading them in that order is what makes the screen
	 * answer a press immediately instead of a network round trip later.
	 */
	const status = $derived(
		voice.needsGesture
			? $LL.voiceIdle()
			: !voice.live
				? $LL.voiceConnecting()
				: voice.talking
					? $LL.voiceListening()
					: voice.state === 'transcribing'
						? $LL.voiceTranscribing()
						: voice.state === 'thinking'
							? $LL.voiceThinking()
							: voice.state === 'speaking'
								? $LL.voiceAnswering()
								: $LL.voiceReady()
	);

	/**
	 * The colour of each state, derived from the accent rather than chosen.
	 *
	 * A hue turned right round for speaking, so listening and answering are not two
	 * shades of one colour but two colours, which is the only difference legible
	 * from across a room. Turned rather than picked, so it holds whatever accent
	 * somebody set and stays inside the palette instead of beside it.
	 *
	 * Thinking keeps the hue and loses most of its chroma. Working is not a third
	 * voice in the conversation.
	 */
	const tint = $derived(
		!voice.live
			? 'var(--color-muted)'
			: voice.talking
				? 'var(--color-accent)'
				: voice.state === 'speaking'
					? 'oklch(from var(--color-accent) l c calc(h + 150))'
					: 'oklch(from var(--color-accent) l calc(c * 0.3) h)'
	);

	/**
	 * The four states the orb draws, which are not quite the five the screen has.
	 *
	 * Transcribing is a wait with nothing to hear, exactly like thinking, and
	 * giving it a look of its own would draw a distinction nobody watching a shape
	 * needs: what they want to know is whether it is their turn, and in both it is
	 * not.
	 */
	const shape = $derived<'idle' | 'listening' | 'thinking' | 'speaking'>(
		!voice.live
			? 'idle'
			: voice.talking
				? 'listening'
				: voice.state === 'speaking'
					? 'speaking'
					: voice.state === 'idle'
						? 'idle'
						: 'thinking'
	);

	/**
	 * Whether the exchange is working, as opposed to waiting on somebody.
	 *
	 * The only thing the status dot animates on. A screen holding the floor open is
	 * still, and a screen doing something breathes: two states, which is as much as
	 * a dot two pixels across can honestly carry.
	 */
	const busy = $derived(
		voice.live && (voice.talking || (voice.state !== 'idle' && voice.state !== 'listening'))
	);

	/** The orb draws the answer, so it reads the answer. Silence otherwise. */
	const sample = $derived(() => (voice.state === 'speaking' ? voice.voiceReading() : SILENCE));

	/**
	 * Whether this screen can do its job, asked before it offers to.
	 *
	 * The instance settles it properly when a ticket is asked for, and it settles
	 * it with the admin's sharing applied, which the browser cannot see. This is
	 * the same question asked locally so the screen can say so up front rather than
	 * opening a microphone that was never going to be heard.
	 */
	// Through the resolved defaults rather than the raw settings, which is what the
	// server does: an administrator can share a transcription model that never
	// appears in this account's own settings, and reading those alone would grey
	// out a screen the instance would happily have run.
	const hears = $derived(
		!!$chatDefaultsConfig.voice.voiceInput && !!$chatDefaultsConfig.voice.voiceModel
	);
	const speaks = $derived(
		!!$settingsStore?.speechOutput && !!$settingsStore?.speechModel && !!$settingsStore?.speechVoice
	);
	const ready = $derived(hears && speaks);

	const missing = $derived(
		!hears && !speaks
			? $LL.voiceSetupBoth()
			: !hears
				? $LL.voiceSetupHearing()
				: $LL.voiceSetupSpeaking()
	);

	/**
	 * The one control, and it means one thing: whether the conversation is open.
	 *
	 * Nothing here starts or ends a *turn*, because nothing should: the screen
	 * opens listening and hears for itself when somebody has finished. A press is
	 * for hanging up, and for picking back up when a browser refused to start the
	 * audio without being touched.
	 */
	function press() {
		if (!ready) return;
		if (voice.live) return voice.stop();
		void voice.start(given ?? undefined);
	}

	/**
	 * Listening on arrival, without being asked.
	 *
	 * A screen whose only purpose is speaking should not open with a button that
	 * says "ready to open". Getting here was itself a tap, which most browsers
	 * accept as the gesture that lets audio start; where one does not, the session
	 * says so and the press above is the way through.
	 */
	onMount(() => {
		if (ready) void voice.start(given ?? undefined);
	});

	onDestroy(() => voice.stop());

	function leave() {
		voice.stop();
		void goto(resolve('/m'));
	}

	const action = $derived(voice.live ? $LL.voiceStop() : $LL.voiceStart());
</script>

<div class="relative flex h-full flex-col overflow-hidden px-6 py-8">
	<!-- Who is answering, where the exchange has got to, and the way out. Three
	     cells rather than two ends and a gap: the step belongs in the middle and it
	     has to keep its place there whatever the name on the left is doing, which a
	     centred overlay cannot promise on a narrow screen.

	     Nothing at all in the first cell when the conversation belongs to nobody in
	     particular: an empty corner says "this is the app" perfectly well. The way
	     out sits opposite, away from everything else, because a screen you talk to
	     needs its exit somewhere the hand is not. -->
	<div class="grid w-full grid-cols-[1fr_auto_1fr] items-center gap-3">
		<div class="flex min-w-0 items-center">
			{#if persona && conversation}
				<a
					href={resolve('/m/sessions/[id]', { id: conversation })}
					class="flex min-w-0 items-center gap-2 rounded-full transition-opacity active:opacity-70"
				>
					<PersonaAvatar {persona} size={36} />
					<span class="text-muted truncate text-sm">{persona.name}</span>
				</a>
			{/if}
		</div>

		<!-- Which step the exchange is on, said where a status belongs rather than
		     under the thing everybody is watching. It used to sit below the orb as a
		     sentence addressed to the reader, which read as an instruction ("tap and
		     speak") on a screen that does not need to be tapped, and it moved the
		     transcript every time it changed length.

		     A dot and a word. The dot carries the state in the same colour the orb
		     does, so the two agree from across a room, and the word says which step
		     for anybody close enough to read it. It breathes while the exchange is
		     doing something and sits still when the floor is yours, which is the one
		     distinction worth animating. -->
		{#if ready}
			<p
				class="text-muted flex items-center gap-2 text-[11px] font-medium tracking-[0.14em] uppercase"
				aria-live="polite"
			>
				<span
					class="h-1.5 w-1.5 shrink-0 rounded-full transition-colors duration-300"
					class:working={busy}
					style="background: {tint}"
				></span>
				{status}
			</p>
		{:else}
			<!-- Nothing to report on a screen that cannot run. What is wrong is said in
			     full below, beside the way to fix it. -->
			<span></span>
		{/if}

		<div class="flex justify-end">
			<button
				type="button"
				onclick={leave}
				aria-label={$LL.close()}
				class="text-muted hover:text-active border-shade-3 flex h-10 w-10 items-center justify-center rounded-full border transition-colors"
			>
				<X class="h-4 w-4" />
			</button>
		</div>
	</div>

	<!--
		The orb is the control, and that is the whole of the interface.

		Pressing the object that is already the only thing on screen removes both the
		second place to look and the second place to aim, and it gives a surface
		meant to be used at arm's length a target the size of a fist.

		Colour carries the one fact a shape cannot: whether a conversation is
		engaged. Muted is a screen waiting to be started. The transition is not
		decoration either, since the drawing reads the computed colour back every
		frame: easing it makes the body cross from one hue to the other rather than
		snap, which is the difference between a state changing and a light switching.
	-->
	<div class="flex flex-1 items-center justify-center">
		<button
			type="button"
			onclick={press}
			aria-label={ready ? action : missing}
			aria-pressed={voice.live}
			disabled={!ready}
			class="group relative flex items-center justify-center rounded-full outline-none"
		>
			<Orb
				class="aspect-square w-[min(78vw,22rem)] transition-[color,transform] duration-300 group-active:scale-95"
				style="color: {tint}"
				phase={shape}
				{sample}
			/>
		</button>
	</div>

	{#if !ready}
		<!-- What is missing, and the door to it. Named in full here rather than in the
		     header, because this is the one case where the screen has nothing to do
		     and the sentence is the content: naming it without offering the way to fix
		     it is a dead end with a caption. -->
		<div class="flex flex-col items-center gap-4 pt-2">
			<p class="text-muted max-w-xs text-center text-sm">{missing}</p>
			<button
				type="button"
				onclick={() => settingsModalOpen.set(true)}
				class="border-shade-3 text-active hover:border-shade-4 rounded-full border px-4 py-2 text-sm transition-colors"
			>
				{$LL.voiceSetupOpen()}
			</button>
		</div>
	{:else if $settingsStore.voiceTranscript}
		<!-- What was said and what came back, because speech recognition is wrong
		     often enough that hearing only the answer leaves no way to tell a bad
		     reply from a misheard question.

		     A fixed height, empty or not. Letting it size itself is what pushed the
		     shape above it up and down a turn at a time. -->
		<div class="transcript flex h-32 w-full shrink-0 flex-col justify-end gap-2 pt-3">
			{#if voice.heard}
				<p class="text-muted text-center text-sm leading-relaxed">{voice.heard}</p>
			{/if}
			{#if voice.answer}
				<p class="text-active text-center text-base leading-relaxed">{voice.answer}</p>
			{/if}
		</div>
	{/if}

	<!-- Your own voice, at the foot, where a level meter belongs. A room it cannot
	     hear draws a flat line, which is the only honest way to say "your
	     microphone is not reaching me" before somebody has spoken a whole sentence
	     into nothing.

	     Always here, live or not, and that is the point. It used to arrive with the
	     conversation and leave with it, and since it sits under a shape that takes
	     whatever height is left, every appearance moved the orb: the screen
	     reorganised itself at the very moments somebody is watching it. Reserved
	     instead, and dimmed while there is nothing to hear, so the only thing that
	     ever changes on this screen is what the shapes are doing.

	     Narrow, and beside the button rather than stretched across the screen. The
	     meter is a reassurance, not a readout; a full-width one competes with the
	     orb for the same glance.

	     The mute button is not a convenience either. A screen that holds the
	     microphone open for the length of a conversation has to offer a way to shut
	     it, visibly, in one press, without ending the conversation. -->
	{#if ready}
		<div
			class="mt-4 flex h-9 w-full shrink-0 items-center justify-center gap-3 transition-opacity duration-300"
			class:opacity-40={!voice.live}
		>
			<VoiceBars
				class="h-4 w-28"
				muted={voice.muted || !voice.live}
				sample={() => voice.micReading()}
			/>
			<button
				type="button"
				onclick={() => voice.toggleMute()}
				aria-label={voice.muted ? $LL.voiceUnmute() : $LL.voiceMute()}
				aria-pressed={voice.muted}
				disabled={!voice.live}
				class="border-shade-3 hover:border-shade-4 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border transition-colors {voice.muted
					? 'text-muted'
					: 'text-active'}"
			>
				{#if voice.muted}
					<MicOff class="h-3.5 w-3.5" />
				{:else}
					<Mic class="h-3.5 w-3.5" />
				{/if}
			</button>
		</div>
	{/if}
</div>

<style lang="postcss">
	/*
	 * A fixed window on the last thing said, not a scroller.
	 *
	 * Nobody scrolls back through a conversation they are having out loud, and a bar
	 * appearing beside a spoken answer is an invitation to do the one thing this
	 * screen is not for. So the height is fixed, the content sits at the bottom, and
	 * anything older than the window simply leaves the top.
	 *
	 * Faded rather than cut. A hard edge reads as a layout mistake; a line dissolving
	 * upwards reads as something passing out of view, which is what it is doing.
	 */
	/*
	 * The status dot, while something is happening.
	 *
	 * Opacity rather than scale: a dot that grows drags the word beside it, and the
	 * point of putting this in the header was that nothing there moves.
	 */
	.working {
		animation: breathe 1.6s ease-in-out infinite;
	}

	@keyframes breathe {
		0%,
		100% {
			opacity: 1;
		}
		50% {
			opacity: 0.35;
		}
	}

	.transcript {
		overflow: hidden;
		mask-image: linear-gradient(to bottom, transparent 0, black 2.5rem);
		-webkit-mask-image: linear-gradient(to bottom, transparent 0, black 2.5rem);
	}
</style>
