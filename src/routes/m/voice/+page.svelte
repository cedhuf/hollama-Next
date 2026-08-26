<script lang="ts">
	import { X } from '@lucide/svelte';
	import { onDestroy, onMount } from 'svelte';

	import LL from '$i18n/i18n-svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { SILENCE } from '$lib/audioReading';
	import { Conversation } from '$lib/chat/conversation.svelte';
	import PersonaAvatar from '$lib/components/PersonaAvatar.svelte';
	import { repository } from '$lib/data';
	import { personasStore, settingsStore } from '$lib/localStorage';
	import { newSession } from '$lib/sessions';
	import { Speaker } from '$lib/speech.svelte';
	import { settingsModalOpen } from '$lib/stores/modal';
	import { generateRandomId } from '$lib/utils';
	import { VoiceRecorder } from '$lib/voice.svelte';

	import LivingText from '../LivingText.svelte';
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

	/**
	 * The conversation to hold, when the screen was opened to hold a particular one.
	 *
	 * A persona on the home screen is a person to talk to, so tapping one arrives
	 * here with their conversation already made: their prompt, their greeting, their
	 * model and whatever was said last time. Without it the screen would start blank
	 * and the persona would be a label on a stranger.
	 *
	 * Read once, on arrival. The screen holds one conversation for as long as it is
	 * open, and swapping it underneath somebody mid-sentence is not a feature.
	 */
	const given = page.url.searchParams.get('session');

	onMount(async () => {
		if (!given) return;
		const stored = await repository.loadSession(given).catch(() => null);
		if (!stored) return;
		chat = new Conversation(stored, { scrollToBottom: () => {} });
		await chat.open(stored, { atBottom: true });
		/**
		 * Their greeting, not their last answer.
		 *
		 * Somebody opening a spoken conversation with a character is starting one, and
		 * being met with the tail of the previous exchange is being handed a page you
		 * are in the middle of. The greeting is what that character says when you walk
		 * in, which is exactly the moment this is.
		 *
		 * Nothing at all when they have no greeting. An empty screen invites a first
		 * word, and the last thing they said three days ago does not.
		 */
		const greeting = ($personasStore ?? []).find(
			(entry) => entry.id === stored.personaId
		)?.greeting;
		answer = greeting?.trim() ?? '';
	});

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
			{
				listen: { silenceMs: $settingsStore.voiceSilenceMs, minimumMs: 750 },
				// A room that said nothing ends the session rather than leaving the screen
				// lit and deaf. Without this the only way back was two presses, one to give
				// up on a turn that had already given up, and one to start again.
				onNothing: () => {
					live = false;
				}
			}
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
	/**
	 * One control, and one meaning: stop whatever is happening.
	 *
	 * Pressing while it listens throws the recording away rather than sending it.
	 * A second press on the thing you just pressed is somebody changing their mind,
	 * and the old behaviour read it as "I have finished speaking", which is the one
	 * interpretation that costs a transcription and an answer nobody wanted. Ending
	 * a turn is the silence gate's job, and it does it without being asked.
	 *
	 * While it reads aloud, stopping is all a press does here, and the loop takes it
	 * from there: `ask` is waiting on the reading, so it resumes and listens again.
	 * Which is exactly what taking the floor back means.
	 */
	function press() {
		// Nothing starts until both halves exist. The control is disabled in that case,
		// so this is the belt to that brace.
		if (!ready) return;

		// Inside the gesture, always, and cheap enough to do on every press. A browser
		// only lets sound out of an audio context a person's own tap created or
		// resumed, and by the time there is an answer to read the tap is long gone.
		speaker.unlock();

		if (!live) {
			live = true;
			return listen();
		}
		if (phase === 'speaking') return speaker.stop();
		if (phase === 'listening') {
			voice.cancel();
			live = false;
			heard = '';
			return;
		}
		// Thinking or transcribing: nothing to keep, and nothing else a press can mean.
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
		!live ? $LL.voiceStart() : phase === 'speaking' ? $LL.voiceInterrupt() : $LL.voiceStop()
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
	 * voice in the conversation, and giving it one would make three colours compete
	 * to mean "your turn".
	 */
	const tint = $derived(
		!live
			? 'var(--color-muted)'
			: phase === 'speaking'
				? 'oklch(from var(--color-accent) l c calc(h + 150))'
				: phase === 'listening'
					? 'var(--color-accent)'
					: 'oklch(from var(--color-accent) l calc(c * 0.3) h)'
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

	/**
	 * Whose voice this is, when it belongs to somebody.
	 *
	 * A screen with no name on it is a screen where every persona sounds like the
	 * app. The face in the corner is the shortest way to say who answered, and
	 * tapping it opens the same conversation in writing, which is where you go when
	 * you want to read back rather than listen.
	 */
	const persona = $derived(
		chat?.session.personaId
			? ($personasStore ?? []).find((entry) => entry.id === chat?.session.personaId)
			: undefined
	);

	/**
	 * Whether this screen can do its job, asked before it offers to.
	 *
	 * Both halves, and both up front. Finding out by trying is how somebody speaks a
	 * whole sentence to a microphone that was never going to be heard, or worse, gets
	 * an answer and only then learns that nothing was ever going to read it out. A
	 * screen whose entire purpose is a spoken exchange should say so before the
	 * exchange rather than during it.
	 *
	 * Recomputed rather than captured: the settings live in a store, so somebody who
	 * goes and fixes this comes back to a screen that has noticed.
	 */
	const hears = $derived(!!$settingsStore && VoiceRecorder.available());
	const speaks = $derived(!!$settingsStore && Speaker.available());
	const ready = $derived(hears && speaks);

	/** What is missing, said plainly. */
	const missing = $derived(
		!hears && !speaks
			? $LL.voiceSetupBoth()
			: !hears
				? $LL.voiceSetupHearing()
				: $LL.voiceSetupSpeaking()
	);

	/** No sound to read while a model is working, and none before anything starts. */
	const sample = $derived(() =>
		phase === 'speaking' ? speaker.reading() : phase === 'listening' ? voice.reading() : SILENCE
	);
</script>

<div class="relative flex h-full flex-col overflow-hidden px-6 py-8">
	<!-- The way out, top right, away from everything else: a screen you talk to
	     needs its exit somewhere the hand is not. -->
	<div class="flex w-full items-center justify-between">
		<!-- Who is answering, and the way to read them instead of hearing them. Nothing
		     at all when the conversation belongs to nobody in particular, rather than a
		     placeholder face: an empty corner says "this is the app" perfectly well. -->
		{#if persona && chat}
			<a
				href={resolve('/m/sessions/[id]', { id: chat.session.id })}
				class="flex items-center gap-2 rounded-full transition-opacity active:opacity-70"
			>
				<PersonaAvatar {persona} size={36} />
				<span class="text-muted max-w-32 truncate text-sm">{persona.name}</span>
			</a>
		{:else}
			<span></span>
		{/if}

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
	<!-- The orb takes the room that is left and sits in the middle of it, so it stays
	     where it was whatever the transcript below is doing. It used to share a
	     `justify-between` with a block that grows and shrinks by three lines, which
	     moved the one fixed point on the screen every time somebody spoke. -->
	<div class="flex flex-1 items-center justify-center">
		<button
			type="button"
			onclick={press}
			aria-label={ready ? action : missing}
			aria-pressed={live}
			disabled={!ready}
			class="group relative flex items-center justify-center rounded-full outline-none"
		>
			<!-- No icon over it. The line below already says what a press does, and a
			     glyph laid on a shape that is moving is a second thing to read in the
			     one place the screen was meant to have only one.

			     The colour transition is not decoration either. The drawing reads the
			     computed colour back every frame, so easing it here makes the orb cross
			     from one hue to the other rather than snap, which is the difference
			     between a state changing and a light being switched. -->
			<Orb
				class="aspect-square w-[min(78vw,22rem)] transition-[color,transform] duration-300 group-active:scale-95"
				style="color: {tint}"
				phase={shape}
				{sample}
			/>

			<!-- Inside the shape rather than under it, which is what let the shape grow:
			     the two were sharing a column and each was making the other smaller.

			     One colour, always, and a light one. It sits on a body that is already
			     changing hue underneath it, and a line that changed with it would be two
			     things saying the same thing while neither stayed readable.

			     Hidden from assistive tech because it is spelled out one letter per
			     element, which is read aloud as letters. The button around it already
			     carries the sentence. -->
			<LivingText
				text={ready ? status : missing}
				class="text-active/50 pointer-events-none absolute max-w-[62%] text-center text-[0.95rem] leading-snug text-balance"
			/>
		</button>
	</div>

	<!-- What was said and what came back, both readable, because speech recognition
	     is wrong often enough that hearing only the answer leaves you no way to tell
	     a bad reply from a misheard question.

	     A fixed height, empty or not. Letting it size itself is what pushed the orb
	     up and down a turn at a time. -->
	<div class="transcript flex h-40 w-full shrink-0 flex-col items-center justify-end gap-3 pb-1">
		{#if !ready}
			<!-- Naming what is missing without offering the door to it is a dead end with
			     a caption. -->
			<button
				type="button"
				onclick={() => settingsModalOpen.set(true)}
				class="border-shade-3 text-active hover:border-shade-4 rounded-full border px-4 py-2 text-sm transition-colors"
			>
				{$LL.voiceSetupOpen()}
			</button>
		{/if}
		{#if heard}
			<LivingText text={heard} class="text-muted text-center text-sm leading-relaxed" />
		{/if}
		{#if answer}
			<!-- An answer runs long, and past the component's ceiling it settles and is
			     simply read. Which is the right way round: a paragraph you are reading
			     should hold still, and the short lines are where this belongs. -->
			<LivingText text={answer} class="text-active text-center text-base leading-relaxed" />
		{/if}
	</div>
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
	 * upwards reads as something passing out of view, which is what it is doing. The
	 * mask is the whole of it: no gradient overlay to keep in step with the
	 * background, and nothing to get wrong when the theme changes.
	 */
	.transcript {
		overflow: hidden;
		mask-image: linear-gradient(to bottom, transparent 0, black 2.5rem);
		-webkit-mask-image: linear-gradient(to bottom, transparent 0, black 2.5rem);
	}
</style>
