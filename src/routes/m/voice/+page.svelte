<script lang="ts">
	import { ArrowUp, LoaderCircle, Mic, X } from '@lucide/svelte';

	import LL from '$i18n/i18n-svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { pendingMessage } from '$lib/stores/pendingMessage';
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
	 * The orb is the whole of the feedback. It is drawn rather than fetched: three
	 * blurred discs of the app's own accent, each on its own slow orbit, so the
	 * shape never repeats exactly and never lands in the same place twice. It
	 * breathes while nothing is happening and swells while listening, which is the
	 * only state this screen has to make legible from arm's length.
	 *
	 * The recorder is the app's own, the same one the desktop composer presses. What
	 * this screen adds is the room to do it in: no field, no keyboard, nothing to
	 * aim at but the one key at the bottom.
	 *
	 * What comes back is put in front of the person rather than sent. Speech
	 * recognition is wrong often enough that sending on their behalf would be the
	 * app putting words in their mouth.
	 */
	const voice = new VoiceRecorder();
	const listening = $derived(voice.state === 'recording');

	let heard = $state('');

	function press() {
		if (voice.state === 'recording') return voice.stop();
		if (voice.state === 'transcribing') return;
		heard = '';
		void voice.start((text) => (heard = text));
	}

	/**
	 * Off to a new conversation, the same hand-off the home page makes: the message
	 * is put down here and the conversation page picks it up and sends it.
	 */
	function send() {
		const prompt = heard.trim();
		if (!prompt) return;
		heard = '';
		pendingMessage.set({ prompt, webSearch: false, webFetch: false, attachments: [] });
		void goto(resolve('/m/sessions/[id]', { id: generateRandomId() }));
	}

	/** Bars of a level meter, still until something is being said. */
	const BARS = 28;
</script>

<div class="relative flex h-full flex-col items-center justify-between overflow-hidden px-6 py-8">
	<!-- The way out, top right, away from everything else: a screen you talk to
	     needs its exit somewhere the hand is not. -->
	<div class="flex w-full justify-end">
		<button
			type="button"
			onclick={() => goto(resolve('/m'))}
			aria-label={$LL.close()}
			class="text-muted hover:text-active border-shade-3 flex h-10 w-10 items-center justify-center rounded-full border transition-colors"
		>
			<X class="h-4 w-4" />
		</button>
	</div>

	<div class="flex flex-col items-center gap-10">
		<Orb class="h-56 w-56 text-[14rem]" active={listening} />

		{#if heard}
			<!-- Read it back before it goes anywhere. -->
			<p class="text-active max-w-sm text-center text-base leading-relaxed">{heard}</p>
		{:else}
			<p class="text-muted max-w-xs text-center text-sm leading-relaxed">
				{voice.state === 'transcribing'
					? $LL.voiceTranscribing()
					: listening
						? $LL.voiceListening()
						: $LL.voiceIdle()}
			</p>
		{/if}
	</div>

	<div class="flex w-full flex-col items-center gap-6">
		<!-- The level, which is flat until there is a level to show. It is drawn from
		     the same accent as the orb so the two read as one instrument. -->
		<div class="flex h-10 items-center justify-center gap-1" aria-hidden="true">
			{#each { length: BARS }, bar (bar)}
				<span
					class="bar bg-accent/70 w-0.5 rounded-full"
					class:bar--live={listening}
					style="--bar: {bar}"
				></span>
			{/each}
		</div>

		<div class="flex items-center gap-4">
			<button
				type="button"
				onclick={press}
				aria-pressed={listening}
				aria-label={$LL.mobileVoice()}
				disabled={voice.state === 'transcribing'}
				class="flex h-16 w-16 items-center justify-center rounded-full transition-all duration-300 active:scale-95 disabled:opacity-60 {listening
					? 'bg-accent text-shade-0 shadow-lg'
					: 'border-shade-3 text-active border'}"
			>
				{#if voice.state === 'transcribing'}
					<LoaderCircle class="h-6 w-6 animate-spin" />
				{:else}
					<Mic class="h-6 w-6" />
				{/if}
			</button>

			{#if heard}
				<!-- Only once there is something to send: a key that does nothing is a
				     key somebody presses to find out. -->
				<button
					type="button"
					onclick={send}
					aria-label={$LL.run()}
					class="bg-accent text-shade-0 flex h-16 w-16 items-center justify-center rounded-full shadow-lg transition-transform active:scale-95"
				>
					<ArrowUp class="h-6 w-6" />
				</button>
			{/if}
		</div>
	</div>
</div>

<style lang="postcss">
	/* The meter. Each bar takes its turn from its own index, so the wave travels
	   across rather than every bar agreeing with its neighbour. */
	.bar {
		height: 0.25rem;
		transition: height 200ms ease-out;
	}

	.bar--live {
		animation: bar-wave 900ms ease-in-out infinite alternate;
		animation-delay: calc(var(--bar) * -60ms);
	}

	@keyframes bar-wave {
		from {
			height: 0.25rem;
		}
		to {
			height: 2rem;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.bar--live {
			animation: none;
		}
	}
</style>
