<script lang="ts">
	import { ArrowUp, LoaderCircle, Mic, Plus } from '@lucide/svelte';

	import LL from '$i18n/i18n-svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { chatDefaultsConfig } from '$lib/chatDefaults';
	import type { Editor } from '$lib/sessions';
	import { VoiceRecorder } from '$lib/voice.svelte';

	/**
	 * The composer, for a phone.
	 *
	 * A field, a microphone and a send key. Not the desktop one, which carries
	 * slash commands, mentions, attachments, the tool switches and an expanding
	 * editor: every one of those earns its place on a screen with room for them,
	 * and none of them is what somebody standing at a bus stop is doing.
	 *
	 * It drives the same conversation object as the desktop composer. Nothing about
	 * a turn is decided here.
	 */
	interface Props {
		editor: Editor;
		onSubmit: () => void;
		disabled?: boolean;
	}

	let { editor = $bindable(), onSubmit, disabled = false }: Props = $props();

	const voiceCfg = $derived($chatDefaultsConfig.voice);
	const voiceReady = $derived(voiceCfg.voiceInput && !!voiceCfg.voiceModel);
	const voice = new VoiceRecorder();

	const canSend = $derived(!!editor.prompt?.trim() && !disabled);

	function dictate() {
		if (voice.state === 'recording') return voice.stop();
		if (voice.state === 'transcribing') return;
		void voice.start((text) => {
			const current = editor.prompt?.trim() ?? '';
			editor.prompt = current ? `${current} ${text}` : text;
		});
	}

	/**
	 * Enter sends, because there is no Enter on a phone keyboard that means
	 * anything else: the return key on a single-line field is the send key, and a
	 * new paragraph is what the dictation and the desktop are for.
	 */
	function onKeyDown(event: KeyboardEvent) {
		if (event.key !== 'Enter' || event.shiftKey) return;
		event.preventDefault();
		if (canSend) onSubmit();
	}
</script>

<div class="glass flex items-end gap-2 rounded-3xl p-2">
	<!-- Everything that is not typing, behind one key: attachments, the camera and
	     the rest land here as they are built, rather than each taking a corner of a
	     bar this narrow. -->
	<button
		type="button"
		onclick={() => goto(resolve('/m/voice'))}
		aria-label={$LL.mobileVoice()}
		class="text-muted hover:text-active flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors"
	>
		<Plus class="h-5 w-5" />
	</button>

	<textarea
		bind:value={editor.prompt}
		onkeydown={onKeyDown}
		rows="1"
		placeholder={$LL.promptPlaceholder()}
		class="text-active placeholder:text-muted field-grow max-h-40 min-h-10 flex-1 resize-none bg-transparent py-2.5 text-sm outline-none"
	></textarea>

	{#if voiceReady && !canSend}
		<button
			type="button"
			onclick={dictate}
			aria-label={$LL.voiceInput()}
			aria-pressed={voice.state === 'recording'}
			disabled={voice.state === 'transcribing'}
			class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors {voice.state ===
			'recording'
				? 'bg-accent text-shade-0'
				: 'text-muted hover:text-active'}"
		>
			{#if voice.state === 'transcribing'}
				<LoaderCircle class="h-5 w-5 animate-spin" />
			{:else}
				<Mic class="h-5 w-5" />
			{/if}
		</button>
	{:else}
		<!-- The send key takes the microphone's place once there is something to
		     send: two keys side by side, one of them always inert, is a choice
		     nobody asked to make. -->
		<button
			type="button"
			onclick={onSubmit}
			disabled={!canSend}
			aria-label={$LL.run()}
			class="bg-accent text-shade-0 flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-opacity active:scale-95 disabled:opacity-40"
		>
			<ArrowUp class="h-5 w-5" />
		</button>
	{/if}
</div>

<style lang="postcss">
	.glass {
		background-color: color-mix(in srgb, var(--color-shade-1) 42%, transparent);
		backdrop-filter: blur(32px) saturate(190%);
		-webkit-backdrop-filter: blur(32px) saturate(190%);
		box-shadow:
			inset 0 1px 0 color-mix(in srgb, white 45%, transparent),
			0 0 0 1px color-mix(in srgb, var(--color-shade-4) 45%, transparent),
			0 8px 28px -10px rgb(0 0 0 / 0.35);
	}

	:global([data-color-theme='dark']) .glass {
		background-color: color-mix(in srgb, var(--color-shade-1) 48%, transparent);
		box-shadow:
			inset 0 1px 0 color-mix(in srgb, white 12%, transparent),
			0 0 0 1px color-mix(in srgb, white 8%, transparent),
			0 8px 28px -10px rgb(0 0 0 / 0.6);
	}
</style>
