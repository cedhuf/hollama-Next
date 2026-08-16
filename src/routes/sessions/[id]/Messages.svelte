<script lang="ts">
	import LL from '$i18n/i18n-svelte';
	import { stripAskBlock } from '$lib/askChoice';
	import { compactionSavings, contextBoundary, lastCompactionIndex } from '$lib/chat/context';
	import EmptyMessage from '$lib/components/EmptyMessage.svelte';
	import { settingsStore } from '$lib/localStorage';
	import { stripReadBlock } from '$lib/readProtocol';
	import { saveSession, type Editor, type Message, type Session } from '$lib/sessions';

	import Article from './Article.svelte';
	import ClearedDivider from './ClearedDivider.svelte';
	import CompactionDivider from './CompactionDivider.svelte';

	interface Props {
		session: Session;
		editor: Editor;
		handleRetry: (index: number) => void;
		/** Locks a quick-choice and sends it; lives in +page so the docked panel shares it. */
		chooseAnswer: (message: Message, selected: string[][]) => void;
		/** The pending quick-choice (shown docked above the composer, so it's skipped inline). */
		pendingChoice?: Message | null;
		assistantLabel?: string;
		/** A summary is being written right now: the boundary is drawn before it lands. */
		isCompacting?: boolean;
		/** Abandon that summary. Absent when there is nothing to abandon. */
		onCancelCompaction?: () => void;
	}

	let {
		session = $bindable(),
		editor = $bindable(),
		handleRetry,
		chooseAnswer,
		pendingChoice = null,
		assistantLabel = undefined,
		isCompacting = false,
		onCancelCompaction = undefined
	}: Props = $props();

	/**
	 * Everything before the last marker is out of context: on screen, but not sent.
	 *
	 * While a compaction runs, every message qualifies in advance — the summary
	 * covers all of them — so the fade lands with the pending pill rather than
	 * after it, and the two read as one action.
	 */
	const foldedBefore = $derived(
		isCompacting ? session.messages.length : lastCompactionIndex(session.messages)
	);
	const fade = $derived($settingsStore.fadeCompactedMessages);

	/**
	 * Where a clear was drawn, and what is behind it.
	 *
	 * Compaction leaves its history on screen, faded; clearing takes it off, into
	 * the divider. The difference is deliberate: a summary is an aside about a
	 * conversation you are still in, while a clear says you are done with that one,
	 * and leaving it in the way would be ignoring what you just asked for.
	 *
	 * Only the last one folds. An earlier clear is inside a stretch that a later
	 * one has already put away, so folding it again would nest two boxes saying the
	 * same thing.
	 */
	const boundary = $derived(contextBoundary(session.messages));
	const clearedAt = $derived(boundary.kind === 'cleared' ? boundary.index : -1);

	/**
	 * The list actually drawn, cut before it is walked.
	 *
	 * Iterating the whole conversation and rendering nothing for the folded part
	 * still costs a block per message: two thousand messages behind a clear were
	 * two thousand empty blocks created and kept. Slicing first means the folded
	 * stretch is not iterated at all.
	 *
	 * `offset` puts the original indices back, since anchors, retries and edits all
	 * address a message by its position in the conversation and not by its position
	 * in what happens to be on screen.
	 */
	const offset = $derived(clearedAt === -1 ? 0 : clearedAt);
	const visible = $derived(clearedAt === -1 ? session.messages : session.messages.slice(clearedAt));

	/**
	 * What the divider holds, computed from the boundary rather than from the
	 * conversation.
	 *
	 * Keyed on the index alone: `session.messages` changes on every streamed token,
	 * and this used to allocate a copy of the whole folded stretch each time. The
	 * folded stretch, by definition, is the part that is not changing.
	 */
	let clearedMessages = $state<Message[]>([]);
	$effect(() => {
		const at = clearedAt;
		clearedMessages = at === -1 ? [] : session.messages.slice(0, at).filter((m) => !m.cleared);
	});

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

	/**
	 * Remove one turn.
	 *
	 * By identity rather than by index: the list drawn is a slice of the
	 * conversation when something has been cleared, and an index into what is on
	 * screen is not an index into what is stored.
	 *
	 * Only the message asked for. Deleting a question does not delete its answer,
	 * because sometimes the answer is the part worth keeping, and a rule that took
	 * both would be one nobody could undo.
	 */
	function handleDeleteMessage(message: Message) {
		session.messages = session.messages.filter((m) => m !== message);
		saveSession(session);
	}

	/**
	 * Undo a compaction: drop the marker and the model sees the whole history
	 * again. Nothing else has to be restored, because nothing was removed.
	 */
	function handleUndoCompaction(message: Message) {
		session.messages = session.messages.filter((m) => m !== message);
		saveSession(session);
	}
</script>

{#if editor.isNewSession}
	<EmptyMessage>{$LL.writePromptToStart()}</EmptyMessage>
{/if}

{#each visible as message, index (session.id + (index + offset))}
	{@const i = index + offset}
	{#if message.cleared}
		{#if i === clearedAt}
			<ClearedDivider
				{message}
				cleared={clearedMessages}
				onUndo={() => handleUndoCompaction(message)}
			/>
		{/if}
	{:else if message.compaction}
		<!-- Not a turn: the boundary where the context above was summarised away. -->
		<CompactionDivider
			{message}
			savings={compactionSavings(session.messages, i)}
			onUndo={() => handleUndoCompaction(message)}
		/>
	{:else if message !== pendingChoice}
		{#key message.role}
			<Article
				{message}
				anchorId="message-{i}"
				retryIndex={['assistant', 'system'].includes(message.role) ? i : undefined}
				{handleRetry}
				{assistantLabel}
				onChoose={(selected) => chooseAnswer(message, selected)}
				handleEditMessage={() => handleEditMessage(message)}
				handleDeleteAttachment={() => handleDeleteAttachment(message)}
				handleDeleteMessage={() => handleDeleteMessage(message)}
				onToggleReasoning={() => saveSession(session)}
				folded={fade && i < foldedBefore}
			/>
		{/key}
	{/if}
{/each}

{#if isCompacting}
	<!-- The boundary, drawn where it will settle: the marker is appended, so the
	     pill that waits is already standing in the pill that reports. -->
	<CompactionDivider pending onCancel={onCancelCompaction} />
{/if}

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
		speakerName={editor.speakerName}
		speakerPersonaId={editor.speakerPersonaId}
		currentRawReasoning={editor.reasoning}
		currentRawCompletion={streamingContent}
		bind:streamingReasoningExpanded={editor.streamingReasoningExpanded}
	/>
{/if}
