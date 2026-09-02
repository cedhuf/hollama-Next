<script lang="ts">
	import LL from '$i18n/i18n-svelte';
	import Select from '$lib/components/Select.svelte';
	import { settingsStore } from '$lib/localStorage';

	/**
	 * Which voice reads.
	 *
	 * A list where the provider publishes one, a text field where it does not, and
	 * the same binding either way: OpenRouter names Kokoro's fifty-four voices, and
	 * a self-hosted endpoint names nothing at all.
	 *
	 * Asked per model, because the answer is per model: Kokoro's names mean nothing
	 * to Deepgram's, so changing the model clears the voice rather than leaving one
	 * behind that the new model refuses.
	 */
	interface Props {
		/** The chosen speech model, or nothing while none is chosen. */
		model?: string;
	}

	let { model }: Props = $props();

	let voices = $state<string[]>([]);
	let asked = $state<string | null>(null);

	/** The connection the model lives on, which is what the route needs naming. */
	const serverId = $derived(
		($settingsStore.models ?? []).find((entry) => entry.name === model)?.serverId
	);

	$effect(() => {
		const name = model;
		const server = serverId;
		if (!name || !server) {
			voices = [];
			asked = null;
			return;
		}
		if (asked === `${server}/${name}`) return;

		// Marked before the answer arrives, so a re-render while it is in flight does
		// not ask again.
		asked = `${server}/${name}`;
		void (async () => {
			const params = new URLSearchParams({ serverId: server, model: name });
			try {
				const response = await fetch(`/api/speak?${params}`);
				const body = response.ok ? await response.json() : { voices: [] };
				if (asked !== `${server}/${name}`) return;
				voices = Array.isArray(body?.voices) ? body.voices : [];
			} catch {
				// No list is a real answer here, not a failure: the field asks for a name
				// instead, which is what a connection that publishes nothing needs.
				if (asked === `${server}/${name}`) voices = [];
			}
		})();
	});

	const options = $derived(voices.map((voice) => ({ value: voice, label: voice })));
</script>

{#if voices.length}
	<Select
		value={$settingsStore.speechVoice || undefined}
		{options}
		searchable={voices.length > 12}
		placeholder={$LL.speechVoice()}
		onChange={(option) => ($settingsStore.speechVoice = option.value)}
	/>
{:else}
	<input
		class="settings-field"
		type="text"
		autocomplete="off"
		spellcheck="false"
		placeholder={$LL.speechVoice()}
		bind:value={$settingsStore.speechVoice}
	/>
{/if}
