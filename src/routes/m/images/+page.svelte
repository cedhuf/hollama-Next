<script lang="ts">
	import { LoaderCircle, Mic, Sparkles } from '@lucide/svelte';

	import LL from '$i18n/i18n-svelte';
	import { chatDefaultsConfig } from '$lib/chatDefaults';
	import Head from '$lib/components/Head.svelte';
	import ImageViewer from '$lib/components/ImageViewer.svelte';
	import type { GeneratedImage } from '$lib/generatedImages';
	import { generateImages, imageModels, imagesStore, imageUrl, serverIdFor } from '$lib/images';
	import { toast } from '$lib/toast';
	import { VoiceRecorder } from '$lib/voice.svelte';

	/**
	 * Drawing, on a phone.
	 *
	 * A field, a key, and everything that came before underneath. The desktop page
	 * carries the shapes, the quality, the count, the negative prompt, the rewriter
	 * and reference pictures, and every one of those is worth having on a screen
	 * that can hold them beside the result. None of them is what somebody standing
	 * on a pavement is doing.
	 *
	 * What is left out is left out, not reimplemented: the request goes through the
	 * same `generateImages`, the pictures land in the same gallery, and opening one
	 * opens the app's own viewer. A picture made here is indistinguishable from a
	 * picture made there.
	 */
	let prompt = $state('');
	let busy = $state(false);
	let opened = $state<GeneratedImage | null>(null);

	/** The instance's default where there is one, the first that draws otherwise. */
	const model = $derived(
		$chatDefaultsConfig.images.defaultImageModel || ($imageModels[0]?.name ?? '')
	);

	const voiceCfg = $derived($chatDefaultsConfig.voice);
	const voiceReady = $derived(voiceCfg.voiceInput && !!voiceCfg.voiceModel);
	const voice = new VoiceRecorder();

	function dictate() {
		if (voice.state === 'recording') return voice.stop();
		if (voice.state === 'transcribing') return;
		void voice.start((text) => {
			prompt = prompt.trim() ? `${prompt.trim()} ${text}` : text;
		});
	}

	async function draw() {
		const serverId = serverIdFor(model);
		if (!serverId || !prompt.trim() || busy) return;

		busy = true;
		try {
			await generateImages({ serverId, model, prompt: prompt.trim(), n: 1 });
			prompt = '';
		} catch (error) {
			toast.error($LL.imageGenerationFailed(), {
				description: error instanceof Error ? error.message : undefined
			});
		} finally {
			busy = false;
		}
	}
</script>

<Head title={$LL.images()} />

<div class="flex flex-col gap-4 px-5 pt-6 pb-32">
	<h1 class="text-active text-2xl font-semibold tracking-tight">{$LL.images()}</h1>

	<!-- The field and the key, at the top rather than at the foot: this page is not
	     a conversation, it is a request followed by a wait, and the thing you came
	     to type should not be behind the thing you made last week. -->
	<div class="border-shade-3 bg-shade-0 flex flex-col gap-3 rounded-2xl border p-3">
		<textarea
			bind:value={prompt}
			rows="2"
			placeholder={$LL.imagePromptPlaceholder()}
			class="text-active placeholder:text-muted field-grow max-h-40 resize-none bg-transparent text-sm outline-none"
		></textarea>

		<div class="flex items-center gap-2">
			{#if voiceReady}
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
			{/if}

			<button
				type="button"
				onclick={draw}
				disabled={busy || !prompt.trim() || !model}
				class="bg-accent text-shade-0 ml-auto flex h-10 items-center gap-2 rounded-full px-4 text-sm font-medium transition-opacity active:scale-95 disabled:opacity-40"
			>
				{#if busy}
					<LoaderCircle class="h-4 w-4 animate-spin" />
					{$LL.imageGenerate()}
				{:else}
					<Sparkles class="h-4 w-4" />
					{$LL.imageGenerate()}
				{/if}
			</button>
		</div>
	</div>

	{#if $imagesStore.length}
		<!-- Two columns, square crops, newest first. A phone gallery is for
		     recognising a picture, not for judging it: that is what opening it is
		     for. -->
		<div class="grid grid-cols-2 gap-2">
			{#each $imagesStore as image (image.id)}
				<button
					type="button"
					onclick={() => (opened = image)}
					class="border-shade-3 bg-shade-0 aspect-square overflow-hidden rounded-xl border transition-opacity active:opacity-80"
				>
					<img
						src={imageUrl(image.id)}
						alt={image.prompt}
						loading="lazy"
						class="h-full w-full object-cover"
					/>
				</button>
			{/each}
		</div>
	{:else}
		<div
			class="border-shade-4 text-muted flex flex-col items-center gap-2 rounded-2xl border border-dashed px-6 py-10 text-center"
		>
			<Sparkles class="h-5 w-5" />
			<span class="text-sm">{$LL.imagesEmpty()}</span>
		</div>
	{/if}
</div>

<ImageViewer bind:image={opened} />
