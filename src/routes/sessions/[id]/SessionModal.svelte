<script lang="ts">
	import { MessagesSquare } from '@lucide/svelte';

	import Modal from '$lib/components/Modal.svelte';
	import ModelSelect from '$lib/components/ModelSelect.svelte';
	import { getSessionTitle, saveSession, type Session } from '$lib/sessions';
	import { effectiveSystemPrompt, systemPromptsConfig } from '$lib/systemPrompts';

	interface Props {
		open: boolean;
		session: Session;
		modelName: string | undefined;
	}

	let { open = $bindable(false), session = $bindable(), modelName = $bindable() }: Props = $props();

	const field =
		'w-full rounded-md border border-shade-3 bg-shade-0 px-2.5 py-1.5 text-sm outline-none focus:border-accent';

	const resolvedDefault = $derived(effectiveSystemPrompt(modelName, $systemPromptsConfig.prompts));

	function onTitleInput() {
		saveSession(session);
	}

	function onSystemPromptInput() {
		session.systemPromptEdited = true;
		saveSession(session);
	}

	function resetSystemPromptToDefault() {
		session.systemPrompt = { ...session.systemPrompt, content: resolvedDefault };
		session.systemPromptEdited = false;
		saveSession(session);
	}
</script>

<Modal bind:open>
	<div class="flex w-full flex-col gap-5 overflow-auto p-6">
		<div class="flex items-center gap-2 text-sm font-semibold text-muted">
			<MessagesSquare class="h-4 w-4" />
			Conversation settings
		</div>

		<label class="flex flex-col gap-1 text-sm">
			<span class="text-muted">Title</span>
			<input
				class={field}
				bind:value={session.title}
				oninput={onTitleInput}
				placeholder={getSessionTitle(session) || 'Untitled'}
			/>
		</label>

		<label class="flex flex-col gap-1 text-sm">
			<span class="text-muted">Model</span>
			<ModelSelect bind:value={modelName} />
		</label>

		<label class="flex flex-col gap-1 text-sm">
			<div class="flex items-center justify-between gap-2">
				<span class="text-muted">System prompt</span>
				{#if session.systemPromptEdited && resolvedDefault !== session.systemPrompt.content}
					<button
						type="button"
						class="text-xs text-link hover:underline"
						onclick={resetSystemPromptToDefault}
					>
						Reset to settings default
					</button>
				{/if}
			</div>
			<textarea
				class={field}
				rows="6"
				bind:value={session.systemPrompt.content}
				oninput={onSystemPromptInput}
				placeholder="Instructions for this conversation only…"
			></textarea>
			<span class="text-xs text-muted">
				Specific to this conversation. Pre-filled from your global / per-model prompts; edit to
				override just here.
			</span>
		</label>
	</div>
</Modal>
