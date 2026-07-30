<script lang="ts">
	import LL from '$i18n/i18n-svelte';
	import { stripAskBlock } from '$lib/askChoice';
	import EmptyMessage from '$lib/components/EmptyMessage.svelte';
	import { stripReadBlock } from '$lib/readProtocol';
	import { saveSession, type Editor, type Message, type Session } from '$lib/sessions';

	import Article from './Article.svelte';

	interface Props {
		session: Session;
		editor: Editor;
		handleRetry: (index: number) => void;
		/** Locks a quick-choice and sends it; lives in +page so the docked panel shares it. */
		chooseAnswer: (message: Message, selected: string[][]) => void;
		/** The pending quick-choice (shown docked above the composer, so it's skipped inline). */
		pendingChoice?: Message | null;
		assistantLabel?: string;
	}

	let {
		session = $bindable(),
		editor = $bindable(),
		handleRetry,
		chooseAnswer,
		pendingChoice = null,
		assistantLabel = undefined
	}: Props = $props();

	// While the model is streaming an <ask> block the visible text is empty — show
	// a choices skeleton instead of a bare "…".
	//
	// A <read> block is protocol too, and its whole round is thrown away once the
	// pages come back: showing it wrote an answer on screen that then vanished.
	// Cut from the opening tag, so a half-streamed block never lands either.
	const streamingContent = $derived(
		stripAskBlock(
			stripReadBlock(editor.completion || '')
				.replace(/<read\b[\s\S]*$/i, '')
				.trim()
		)
	);
	const preparingChoices = $derived(
		!!editor.isCompletionInProgress && !streamingContent && /<ask\b/i.test(editor.completion || '')
	);

	function handleEditMessage(message: Message) {
		editor.messageIndexToEdit = session.messages.findIndex((m) => m === message);
		editor.isExpanded = true;
		editor.prompt = message.content;
		editor.attachments = (message.images || []).map((img, idx) => ({
			type: 'image',
			id: `${idx}-${img.filename}`,
			name: img.filename,
			dataUrl: `data:image/png;base64,${img.data}`
		}));
		editor.promptTextarea?.focus();
	}

	function handleDeleteAttachment(message: Message) {
		session.messages = session.messages.filter((m) => m !== message);
		saveSession(session);
	}
</script>

{#if editor.isNewSession}
	<EmptyMessage>{$LL.writePromptToStart()}</EmptyMessage>
{/if}

{#each session.messages as message, i (session.id + i)}
	{#if message !== pendingChoice}
		{#key message.role}
			<Article
				{message}
				retryIndex={['assistant', 'system'].includes(message.role) ? i : undefined}
				{handleRetry}
				{assistantLabel}
				onChoose={(selected) => chooseAnswer(message, selected)}
				handleEditMessage={() => handleEditMessage(message)}
				handleDeleteAttachment={() => handleDeleteAttachment(message)}
				onToggleReasoning={() => saveSession(session)}
			/>
		{/key}
	{/if}
{/each}

{#if editor.isCompletionInProgress}
	<!-- `currentRawCompletion` is the stripped text on purpose: a <read> round is
	     not an answer, and treating it as one collapsed the timeline mid-turn. -->
	<Article
		message={{
			role: 'assistant',
			content: streamingContent,
			reasoning: editor.reasoning,
			reasoningTrace: editor.reasoningTrace,
			webSearch: editor.webSearchInfo
		}}
		isStreamingArticle={true}
		isSearching={editor.isSearching}
		searchActivity={editor.searchActivity}
		searchQuery={editor.searchQuery}
		{preparingChoices}
		{assistantLabel}
		currentRawReasoning={editor.reasoning}
		currentRawCompletion={streamingContent}
		bind:streamingReasoningExpanded={editor.streamingReasoningExpanded}
	/>
{/if}
