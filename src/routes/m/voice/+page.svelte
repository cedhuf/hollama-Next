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
	import Bloom from '$lib/voice/Bloom.svelte';
	import { VoiceSession } from '$lib/voice/session.svelte';
	import VoiceBars from '$lib/voice/VoiceBars.svelte';

	/**
	 * Talking to it, rather than typing at it.
	 *
	 * Deliberately almost empty: every control that is not part of the one thing
	 * being done here is a control pressed by mistake while somebody is speaking.
	 *
	 * A conversation rather than a form, because the microphone stays open: you
	 * speak, it hears you stop, the answer is read back, and you cut it off by
	 * talking.
	 *
	 * `VoiceSession` holds the socket, the worklets and the microphone; this file
	 * only draws, and the turn runs on the server through the same orchestrator.
	 *
	 * Two visuals for two speakers: the orb answering, the bars at the foot yours.
	 */
	const voice = new VoiceSession();

	/** Read once, on arrival: the screen holds one conversation for as long as it is open. */
	const given = page.url.searchParams.get('session');

	/** Whose voice this is, when it belongs to somebody. */
	let persona = $state<Persona | undefined>(undefined);

	onMount(async () => {
		if (!given) return;
		const stored = await repository.loadSession(given).catch(() => null);
		if (!stored) return;

		// What has already been said, so the screen opens on the conversation rather
		// than on the visit. Also how a persona's greeting appears: it is the first
		// message of their conversation.
		voice.seed(stored.messages ?? []);
		if (stored.personaId) {
			persona = ($personasStore ?? []).find((entry) => entry.id === stored.personaId);
		}
	});

	/** The conversation being written into, which is the one to go and read. */
	const conversation = $derived(voice.sessionId || given || '');

	/** `voice.talking` is the person's and instant; everything else is the server's and arrives later. That order is what makes the screen answer a press immediately. */
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

	/** Transcribing is a wait with nothing to hear, exactly like thinking. What somebody watching a shape wants to know is whether it is their turn. */
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
	 * The status dot's colour, which is the shape's own state colour.
	 *
	 * The same rules `Bloom` applies to itself, repeated here because a dot six
	 * pixels across cannot inherit from a body it sits nowhere near. If one of them
	 * moves, both move: the whole point of the dot is that it agrees with the shape
	 * from across a room.
	 */
	const tint = $derived(
		!voice.live
			? 'var(--color-muted)'
			: shape === 'idle'
				? 'oklch(from var(--color-accent) l calc(c * 0.22) h)'
				: shape === 'thinking'
					? 'oklch(from var(--color-accent) l calc(c * 0.85) calc(h + 150))'
					: 'var(--color-accent)'
	);

	/** The only thing the status dot animates on: a screen holding the floor open is still, one doing something breathes. Two states is all a dot two pixels across can carry. */
	const busy = $derived(
		voice.live && (voice.talking || (voice.state !== 'idle' && voice.state !== 'listening'))
	);

	/** The shape draws the answer, so it reads the answer. Silence otherwise. */
	const sample = $derived(() => (voice.state === 'speaking' ? voice.voiceReading() : SILENCE));

	/**
	 * Whether this screen can do its job, asked before it offers to. The instance
	 * settles it when a ticket is asked for, with the admin's sharing applied; this
	 * is the same question asked locally, so the screen can say so up front.
	 *
	 * Through the resolved defaults rather than the raw settings, as the server
	 * does: an administrator can share a transcription model that never appears in
	 * this account's own settings.
	 */
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

	/** Nothing here starts or ends a *turn*: the screen opens listening and hears for itself when somebody has finished. A press hangs up, or gets through a browser that refused to start the audio. */
	function press() {
		if (!ready) return;
		if (voice.live) return voice.stop();
		void voice.start(given ?? undefined);
	}

	/** Getting here was itself a tap, which most browsers accept as the gesture that lets audio start. Where one does not, the press above is the way through. */
	onMount(() => {
		if (ready) void voice.start(given ?? undefined);
	});

	/** It follows the conversation until somebody scrolls back, then stops: an answer arriving should not yank the line being read off the screen. */
	let log = $state<HTMLDivElement | null>(null);
	let following = $state(true);

	function follow() {
		if (!log) return;
		following = log.scrollHeight - log.scrollTop - log.clientHeight < 24;
	}

	$effect(() => {
		// One number covering both ways the transcript grows: another line, or another
		// sentence on the line being written.
		const written = voice.lines.length + (voice.lines.at(-1)?.text.length ?? 0);
		if (written && following && log) log.scrollTop = log.scrollHeight;
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
	     cells rather than two ends and a gap, so the step keeps its place in the
	     middle whatever the name on the left is doing. -->
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

		<!-- Which step the exchange is on, said where a status belongs. Below the orb
		     it read as an instruction ("tap and speak") on a screen that does not need
		     tapping, and moved the transcript every time it changed length.

		     A dot and a word, the dot in the same colour the orb is using. -->
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
			<!-- Nothing to report on a screen that cannot run: what is wrong is said in
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
		The orb is the control, and that is the whole of the interface: pressing the
		only thing on screen removes the second place to look and the second place to
		aim, and gives a surface used at arm's length a target the size of a fist.

		Colour carries the one fact a shape cannot: whether a conversation is engaged.
		The transition is not decoration, since the drawing reads the computed colour
		back every frame, so easing it makes the body cross from one hue to the other
		rather than snap.
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
			<Bloom
				class="aspect-square w-[min(78vw,22rem)] transition-transform duration-300 group-active:scale-95"
				phase={shape}
				{sample}
			/>
		</button>
	</div>

	{#if !ready}
		<!-- What is missing, and the door to it. Named in full here, because this is the
		     one case where the sentence is the content: naming it without offering the
		     way to fix it is a dead end with a caption. -->
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
		<!-- What was said and what came back, because speech recognition is wrong often
		     enough that hearing only the answer leaves no way to tell a bad reply from a
		     misheard question.

		     The whole conversation rather than the last exchange, and it scrolls: a
		     spoken conversation is the one nobody can reread in their head. -->
		<div
			bind:this={log}
			onscroll={follow}
			class="transcript h-32 w-full shrink-0 space-y-2 overflow-y-auto pt-3"
		>
			{#each voice.lines as line, index (index)}
				<p
					class="text-center leading-relaxed {line.role === 'user'
						? 'text-muted text-sm'
						: 'text-active text-base'}"
				>
					{line.text}
				</p>
			{/each}
		</div>
	{/if}

	<!-- Your own voice, at the foot, where a level meter belongs. A room it cannot
	     hear draws a flat line, which is the only honest way to say "your microphone
	     is not reaching me".

	     Always here, live or not: it sits under a shape that takes whatever height is
	     left, so arriving with the conversation moved the orb every time. -->
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
	 * A fixed window on the last thing said, not a scroller. Nobody scrolls back
	 * through a conversation they are having out loud, so the height is fixed, the
	 * content sits at the bottom, and anything older leaves the top. Faded rather
	 * than cut: a hard edge reads as a layout mistake.
	 */

	/* The status dot. Opacity rather than scale: a dot that grows drags the word beside it. */
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
		mask-image: linear-gradient(to bottom, transparent 0, black 2.5rem);
		-webkit-mask-image: linear-gradient(to bottom, transparent 0, black 2.5rem);

		/* Scrollable, with nothing to say so: a bar down the side of a spoken
		   conversation is furniture on a screen with one object on it, and the fade
		   above already says there is more up there. */
		scrollbar-width: none;
		overscroll-behavior: contain;
		-webkit-overflow-scrolling: touch;
	}

	.transcript::-webkit-scrollbar {
		display: none;
	}
</style>
