<script lang="ts">
	import LL from '$i18n/i18n-svelte';
	import { stripAskBlock } from '$lib/askChoice';
	import { compactionSavings } from '$lib/chat/context';
	import { conversationBoundary } from '$lib/chat/notes';
	import EmptyMessage from '$lib/components/EmptyMessage.svelte';
	import { settingsStore } from '$lib/localStorage';
	import { stripReadBlock } from '$lib/readProtocol';
	import { saveSession, type Editor, type Message, type Session } from '$lib/sessions';

	import Article from './Article.svelte';
	import ClearedDivider from './ClearedDivider.svelte';
	import CompactionDivider from './CompactionDivider.svelte';
	import ContextDivider from './ContextDivider.svelte';
	import MentionDivider from './MentionDivider.svelte';
	import PlaybooksDivider from './PlaybooksDivider.svelte';
	import ToolApproval from './ToolApproval.svelte';

	interface Props {
		session: Session;
		editor: Editor;
		handleRetry: (index: number) => void;
		/** Locks a quick-choice and sends it; lives in +page so the docked panel shares it. */
		chooseAnswer: (message: Message, selected: string[][]) => void;
		/** The pending quick-choice (shown docked above the composer, so it's skipped inline). */
		pendingChoice?: Message | null;
		/** Here rather than in either composer: the question belongs at the foot of the thread, which on a phone and a desktop is the same place. One implementation, both surfaces. */
		onApproveTool?: (allow: boolean) => void;
		assistantLabel?: string;
		/** A summary is being written right now: the boundary is drawn before it lands. */
		isCompacting?: boolean;
		/** Abandon that summary. Absent when there is nothing to abandon. */
		onCancelCompaction?: () => void;
		/** Fold a recorded mention into this conversation. Lives in +page, which writes it. */
		onAddMention?: (message: Message) => void;
		/** Switch a playbook on or off for this conversation. */
		onTogglePlaybook?: (id: string) => void;
	}

	let {
		session = $bindable(),
		editor = $bindable(),
		handleRetry,
		chooseAnswer,
		onApproveTool = undefined,
		pendingChoice = null,
		assistantLabel = undefined,
		isCompacting = false,
		onCancelCompaction = undefined,
		onAddMention = undefined,
		onTogglePlaybook = undefined
	}: Props = $props();

	/**
	 * Where a clear was drawn, and what is behind it.
	 *
	 * Compaction leaves its history faded on screen; clearing takes it into the
	 * divider, because a clear says you are done with that conversation.
	 *
	 * Only the last one folds: an earlier clear is inside a stretch a later one has
	 * already put away.
	 */
	const boundary = $derived(conversationBoundary(session.messages));
	const clearedAt = $derived(boundary.note?.kind === 'cleared' ? boundary.index : -1);

	/** While a compaction runs, every message qualifies in advance, so the fade lands with the pending pill rather than after it. */
	const foldedBefore = $derived(
		isCompacting
			? session.messages.length
			: boundary.note?.kind === 'compaction'
				? boundary.index
				: -1
	);
	const fade = $derived($settingsStore.fadeCompactedMessages);

	/**
	 * The list actually drawn, cut before it is walked: rendering nothing for the
	 * folded part still costs a block per message, and two thousand messages behind
	 * a clear were two thousand empty blocks.
	 *
	 * `offset` puts the original indices back, since anchors, retries and edits all
	 * address a message by its position in the conversation.
	 */
	const offset = $derived(clearedAt === -1 ? 0 : clearedAt);
	const visible = $derived(clearedAt === -1 ? session.messages : session.messages.slice(clearedAt));

	/** Keyed on the index alone: `session.messages` changes on every streamed token, and this used to copy the whole folded stretch each time. */
	let clearedMessages = $state<Message[]>([]);
	$effect(() => {
		const at = clearedAt;
		clearedMessages =
			at === -1 ? [] : session.messages.slice(0, at).filter((m) => m.note?.kind !== 'cleared');
	});

	// While an <ask> block streams the visible text is empty: a choices skeleton
	// rather than a bare ellipsis. A <read> block is protocol too and its round is
	// thrown away once the pages come back, so it is cut from the opening tag.
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
	 * By identity rather than by index: the list drawn is a slice when something has
	 * been cleared. Only the message asked for, since sometimes the answer is the
	 * part worth keeping.
	 */
	function handleDeleteMessage(message: Message) {
		session.messages = session.messages.filter((m) => m !== message);
		saveSession(session);
	}

	/** Drop the marker and the model sees the whole history again. Nothing else has to be restored, because nothing was removed. */
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
	{#if message.note}
		<!-- Not a turn: something that happened to the conversation. A kind this build
		     cannot draw is drawn as nothing, the same answer the context builder gives. -->
		{#if message.note.kind === 'cleared'}
			{#if i === clearedAt}
				<ClearedDivider
					note={message.note}
					cleared={clearedMessages}
					onUndo={() => handleUndoCompaction(message)}
				/>
			{/if}
		{:else if message.note.kind === 'compaction'}
			<CompactionDivider
				note={message.note}
				summary={message.content}
				savings={compactionSavings(session.messages, i)}
				onUndo={() => handleUndoCompaction(message)}
			/>
		{:else if message.note.kind === 'context'}
			<ContextDivider note={message.note} />
		{:else if message.note.kind === 'mention'}
			<MentionDivider note={message.note} onAdd={() => onAddMention?.(message)} />
		{:else if message.note.kind === 'playbooks'}
			<PlaybooksDivider
				active={session.playbookIds ?? []}
				onToggle={(id) => onTogglePlaybook?.(id)}
			/>
		{/if}
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
	<!-- Drawn where it will settle, so the pill that waits stands in for the pill
	     that reports. -->
	<CompactionDivider pending onCancel={onCancelCompaction} />
{/if}

{#if editor.pendingApproval && onApproveTool}
	<!-- The turn is stopped here. Below the half-written answer, because what the
	     model said on its way to the call is what the decision is about. -->
	{#key editor.pendingApproval.id}
		<div class="mt-3">
			<ToolApproval request={editor.pendingApproval} onDecide={onApproveTool} />
		</div>
	{/key}
{/if}

{#if editor.isCompletionInProgress}
	<!-- The stripped text on purpose: a <read> round is not an answer, and treating
	     it as one collapsed the timeline mid-turn. -->
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
