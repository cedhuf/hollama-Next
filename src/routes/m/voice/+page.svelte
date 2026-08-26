<script lang="ts">
	import { Mic, X } from '@lucide/svelte';
	import { onDestroy } from 'svelte';

	import LL from '$i18n/i18n-svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { SILENCE } from '$lib/audioReading';
	import { Conversation } from '$lib/chat/conversation.svelte';
	import { settingsStore } from '$lib/localStorage';
	import { newSession } from '$lib/sessions';
	import { Speaker } from '$lib/speech.svelte';
	import { generateRandomId } from '$lib/utils';
	import { VoiceRecorder } from '$lib/voice.svelte';

	import Orb from '../Orb.svelte';

	/**
	 * Talking to it, rather than typing at it.
	 *
	 * The whole screen, and deliberately almost empty: one thing is being done
	 * here, and every control that is not part of it is a control asking to be
	 * pressed by mistake while somebody is speaking.
	 *
	 * It is a loop rather than a form. You speak, it stops listening on its own
	 * when the room goes quiet, the turn runs here, the answer is read back, and it
	 * listens again. Nothing is tapped between one question and the next, which is
	 * the whole difference between a voice mode and a microphone button: a mode you
	 * can use with the phone on the table.
	 *
	 * The engine is the app's own. `Conversation` holds the turn, the tools and the
	 * streaming, and it saves as it goes, so an exchange held here is an ordinary
	 * conversation in the list afterwards, with every word of it readable. A voice
	 * mode that kept no transcript would be the one part of the app you could not
	 * go back and check.
	 *
	 * The orb is the whole of the feedback. It breathes while nothing is happening
	 * and swells while listening, which is the only state this screen has to make
	 * legible from arm's length. The meter beneath it is now drawn from the
	 * microphone itself rather than animated on a timer, so a room it cannot hear
	 * reads as a flat line instead of a reassuring wave.
	 */
	const voice = new VoiceRecorder();
	const speaker = new Speaker();

	/**
	 * The conversation this screen is holding, made on the first question.
	 *
	 * Not before: arriving at the voice screen and leaving without saying anything
	 * should leave nothing behind, and a session created on mount would put an empty
	 * conversation in the list every time somebody looked in.
	 */
	let chat = $state<Conversation | null>(null);

	/** Whether the loop is running, as opposed to waiting to be started. */
	let live = $state(false);
	let heard = $state('');
	let answer = $state('');

	type Phase = 'idle' | 'listening' | 'transcribing' | 'thinking' | 'speaking';

	const phase = $derived<Phase>(
		voice.state === 'recording'
			? 'listening'
			: voice.state === 'transcribing'
				? 'transcribing'
				: chat?.editor.isCompletionInProgress
					? 'thinking'
					: speaker.state !== 'idle'
						? 'speaking'
						: 'idle'
	);

	const status = $derived(
		phase === 'listening'
			? $LL.voiceListening()
			: phase === 'transcribing'
				? $LL.voiceTranscribing()
				: phase === 'thinking'
					? $LL.voiceThinking()
					: phase === 'speaking'
						? $LL.voiceAnswering()
						: $LL.voiceIdle()
	);

	/**
	 * Listen, with the gate on.
	 *
	 * How long a quiet ends the recording is the person's, set in Settings, Voice:
	 * somebody who thinks mid-sentence needs three seconds and somebody dictating a
	 * list is cut off by anything over one, and no single number is right for both.
	 *
	 * The floor under it is not theirs and is not offered: nothing ends a recording
	 * in its first three quarters of a second, because somebody who taps and then
	 * gathers their thoughts has not finished speaking, they have not started.
	 */
	function listen() {
		heard = '';
		void voice.start(
			(text) => {
				heard = text;
				void ask(text);
			},
			{ silenceMs: $settingsStore.voiceSilenceMs, minimumMs: 750 }
		);
	}

	/** One turn: send what was heard, wait for the answer, read it back, listen again. */
	async function ask(prompt: string) {
		answer = '';
		const session = (chat ??= new Conversation(newSession(generateRandomId()), {
			// Nothing scrolls on this screen. The engine asks anyway, because the
			// conversation page needs it, and answering with nothing is the honest way
			// to say so.
			scrollToBottom: () => {}
		}));

		const before = session.session.messages.length;
		session.editor.prompt = prompt;
		session.submit();

		const reply = await settled(session, before);
		if (!live) return;

		if (reply) {
			answer = reply;
			await speaker.say(reply);
		}

		// Round again, unless something stopped the loop while the answer played, or
		// unless going round by itself is not wanted: a microphone that reopens on its
		// own is a reasonable thing to switch off, and switching it off is not the
		// same as not wanting the screen.
		if (!live) return;
		if ($settingsStore.voiceAutoContinue) return listen();
		live = false;
	}

	/**
	 * The answer, once the turn is over.
	 *
	 * Watched rather than awaited because `submit` is deliberately fire and forget:
	 * the turn outlives the page that started it, which is what lets a reload pick
	 * one back up, and there is no promise to hold on to. So this asks the two
	 * questions the engine does answer, at an interval nobody can perceive: has a
	 * message arrived after the one we sent, and has the turn stopped running.
	 */
	function settled(session: Conversation, before: number): Promise<string> {
		return new Promise((done) => {
			// Two phases, because "not running" means opposite things on either side of
			// the turn starting. Before it, it means the request has not gone out yet;
			// after it, it means there is an answer to read. Watching only for "stopped"
			// would resolve instantly on the gap between submitting and connecting.
			let started = false;
			// A turn that never begins: a model that was never resolved, or a refusal
			// that came back before the first token.
			const startedBy = Date.now() + 5_000;
			// And a floor under the whole thing. A turn that is refused outright leaves
			// the flag down and no message behind, and without this the loop would sit
			// here waiting for an answer nobody is writing.
			const deadline = Date.now() + 15 * 60_000;

			const timer = setInterval(() => {
				const finish = (text: string) => {
					clearInterval(timer);
					done(text);
				};

				if (!live || Date.now() > deadline) return finish('');

				if (session.editor.isCompletionInProgress) {
					started = true;
					return;
				}
				// Still waiting for it to begin, and not for ever.
				if (!started) {
					if (Date.now() > startedBy) return finish('');
					return;
				}

				const last = session.session.messages.at(-1);
				if (session.session.messages.length <= before || last?.role !== 'assistant') {
					return finish('');
				}
				finish(last.content ?? '');
			}, 120);
		});
	}

	/**
	 * The one key, which means whichever of four things the moment calls for.
	 *
	 * Speaking is the interesting case: pressing while it reads is how you cut it
	 * off and take the floor, so it stops and listens in the same press rather than
	 * merely falling silent.
	 */
	function press() {
		// Inside the gesture, always, and cheap enough to do on every press. A browser
		// only lets sound out of an audio context a person's own tap created or
		// resumed, and by the time there is an answer to read the tap is long gone.
		speaker.unlock();

		if (!live) {
			live = true;
			return listen();
		}
		if (phase === 'listening') return voice.stop();
		if (phase === 'speaking') {
			speaker.stop();
			return listen();
		}
		// Thinking or transcribing: the only useful thing a press can mean is stop.
		halt();
	}

	/** Everything down, nothing left running. */
	function halt() {
		live = false;
		voice.cancel();
		speaker.stop();
	}

	onDestroy(halt);

	function leave() {
		halt();
		void goto(resolve('/m'));
	}
	/**
	 * What the one control means right now, for the label a screen reader reads.
	 *
	 * The orb is the button, so it has to say what pressing it would do rather than
	 * what it is showing. Those are different sentences in three of the four states.
	 */
	const action = $derived(
		!live
			? $LL.voiceStart()
			: phase === 'speaking'
				? $LL.voiceInterrupt()
				: phase === 'listening'
					? $LL.voiceSend()
					: $LL.voiceStop()
	);

	/**
	 * The four states the orb can draw, which are not quite the five this screen has.
	 *
	 * Transcribing is a wait with nothing to hear, exactly like thinking, and giving
	 * it a look of its own would draw a distinction nobody watching an orb needs:
	 * what they want to know is whether it is their turn, and in both it is not.
	 */
	const shape = $derived<'idle' | 'listening' | 'thinking' | 'speaking'>(
		phase === 'transcribing' ? 'thinking' : phase
	);

	/** No sound to read while a model is working, and none before anything starts. */
	const sample = $derived(() =>
		phase === 'speaking' ? speaker.reading() : phase === 'listening' ? voice.reading() : SILENCE
	);
</script>

<div class="relative flex h-full flex-col items-center justify-between overflow-hidden px-6 py-8">
	<!-- The way out, top right, away from everything else: a screen you talk to
	     needs its exit somewhere the hand is not. -->
	<div class="flex w-full justify-end">
		<button
			type="button"
			onclick={leave}
			aria-label={$LL.close()}
			class="text-muted hover:text-active border-shade-3 flex h-10 w-10 items-center justify-center rounded-full border transition-colors"
		>
			<X class="h-4 w-4" />
		</button>
	</div>

	<!--
		The orb is the control, and that is the whole of the interface.

		It used to say what was happening while a key somewhere else decided what
		happened next, which is two things to watch and two places to aim. Pressing
		the object that is already the only thing on screen removes both, and it
		gives a surface meant to be used at arm's length a target the size of a fist.

		Colour carries the one fact a shape cannot: whether a conversation is engaged.
		Muted is a screen waiting to be started. The accent is a microphone that will
		open again by itself when the answer finishes, which is worth saying plainly
		and continuously rather than in a word that scrolls past.
	-->
	<button
		type="button"
		onclick={press}
		aria-label={action}
		aria-pressed={live}
		class="group flex flex-col items-center gap-8 rounded-full outline-none"
	>
		<span class="relative flex items-center justify-center">
			<Orb
				class="h-60 w-60 transition-transform duration-300 group-active:scale-95 {live
					? 'text-accent'
					: 'text-muted'}"
				phase={shape}
				{sample}
			/>
			{#if !live}
				<!-- One mark, and only until something starts: an icon laid over a shape
				     that is already moving is a second thing to read. -->
				<Mic class="text-muted pointer-events-none absolute h-7 w-7" />
			{/if}
		</span>

		<span class="text-muted text-sm">{status}</span>
	</button>

	<!-- What was said and what came back, both readable, because speech recognition
	     is wrong often enough that hearing only the answer leaves you no way to tell
	     a bad reply from a misheard question. -->
	<div class="flex max-h-48 w-full max-w-sm flex-col items-center gap-3 overflow-y-auto">
		{#if heard}
			<p class="text-muted text-center text-sm leading-relaxed">{heard}</p>
		{/if}
		{#if answer}
			<p class="text-active text-center text-base leading-relaxed">{answer}</p>
		{/if}
	</div>
</div>
