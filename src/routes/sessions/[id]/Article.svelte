<script lang="ts">
	import {
		BookMarked,
		Brain,
		Check,
		ChevronDown,
		ChevronUp,
		FileText,
		Globe,
		Pencil,
		Plug,
		RefreshCw,
		Trash2,
		X
	} from '@lucide/svelte';
	import { untrack } from 'svelte';
	import { quadInOut } from 'svelte/easing';
	import { slide } from 'svelte/transition';

	import LL from '$i18n/i18n-svelte';
	import { splitMentions } from '$lib/chat/mentions';
	import Badge from '$lib/components/Badge.svelte';
	import Button from '$lib/components/Button.svelte';
	import ButtonCopy from '$lib/components/ButtonCopy.svelte';
	import Markdown from '$lib/components/Markdown.svelte';
	import PersonaAvatar from '$lib/components/PersonaAvatar.svelte';
	import ThinkingIndicator from '$lib/components/ThinkingIndicator.svelte';
	import { personasStore, settingsStore } from '$lib/localStorage';
	import { type Message, type ReasoningStep } from '$lib/sessions';
	import { openKnowledge } from '$lib/stores/modal';

	import ActivityText from './ActivityText.svelte';
	import AskChoices from './AskChoices.svelte';
	import AttachmentPill from './AttachmentPill.svelte';

	let {
		message,
		retryIndex = undefined,
		handleRetry = undefined,
		handleEditMessage = undefined,
		handleDeleteAttachment = undefined,
		handleDeleteMessage = undefined,
		onChoose = undefined,
		isStreamingArticle = false,
		isSearching = false,
		searchActivity = undefined,
		searchQuery = undefined,
		preparingChoices = false,
		assistantLabel = undefined,
		currentRawReasoning,
		currentRawCompletion,
		// Write-only here: the component sets it for the parent and never reads it
		// back, which the rule below reads as a dead initialiser. It is not: an unbound
		// parent still needs the default, and $bindable() must be the declared value.
		// eslint-disable-next-line no-useless-assignment
		streamingReasoningExpanded = $bindable(false),
		onToggleReasoning = undefined,
		anchorId = undefined,
		folded = false,
		speakerName: liveSpeakerName = undefined,
		speakerPersonaId: liveSpeakerPersonaId = undefined
	}: {
		message: Message;
		/** Who is writing the bubble being streamed, when it is not the assistant. */
		speakerName?: string;
		speakerPersonaId?: string;
		retryIndex?: number;
		handleRetry?: (index: number) => void;
		handleEditMessage?: (message: Message) => void;
		handleDeleteAttachment?: (message: Message) => void;
		/** Removes this one turn from the conversation. Absent where that makes no sense. */
		handleDeleteMessage?: (message: Message) => void;
		/** Called with the picked option(s) when the message has quick-choice buttons. */
		onChoose?: (selected: string[][]) => void;
		isStreamingArticle?: boolean;
		isSearching?: boolean;
		/** Whether the running lookup is a search or a page read. They read differently. */
		searchActivity?: 'search' | 'read' | 'tool';
		searchQuery?: string;
		/** True while the model is streaming an <ask> block: show a choices skeleton. */
		preparingChoices?: boolean;
		/** Label for assistant bubbles: the persona's name when in a persona chat. */
		assistantLabel?: string;
		currentRawReasoning?: string;
		currentRawCompletion?: string;
		/** Two-way bound to the parent only for the live (streaming) article. */
		streamingReasoningExpanded?: boolean;
		/** Called after the user toggles a completed message, so the parent can persist. */
		onToggleReasoning?: () => void;
		/** DOM id, so search results can scroll to this exact message. */
		anchorId?: string;
		/** Summarised away by a compaction: still readable, no longer sent. */
		folded?: boolean;
	} = $props();

	const isKnowledgeAttachment = $derived(message.knowledge?.name !== undefined);
	const isDocumentAttachment = $derived(!!message.document);
	/** Waiting for a second click, since a deleted turn does not come back. */
	let confirmingDelete = $state(false);

	const isUserRole = $derived(
		message.role === 'user' && !isKnowledgeAttachment && !isDocumentAttachment
	);

	/** The stored name for a message that has landed, the live one for the bubble still filling. The face comes from the library, since it can be missing; the name comes from the message, since attribution cannot. */
	const speakerName = $derived(message.personaName ?? liveSpeakerName);
	const speakerId = $derived(message.personaId ?? liveSpeakerPersonaId);
	const speaker = $derived(
		speakerId ? ($personasStore ?? []).find((persona) => persona.id === speakerId) : undefined
	);

	/** The names called in this message, drawn as labels rather than as plain text. */
	const mentionSegments = $derived(
		isUserRole ? splitMentions(message.content ?? '', $personasStore ?? []) : []
	);
	/** Empty when turned off in Interface, or on messages written before it was recorded. */
	const sentAt = $derived(
		message.createdAt && $settingsStore.showMessageTimestamps
			? new Date(message.createdAt).toLocaleTimeString(undefined, {
					hour: '2-digit',
					minute: '2-digit'
				})
			: ''
	);
	// URLs indexed by citation number, so the answer's inline [n] become links.
	const citations = $derived(message.webSearch?.sources?.map((s) => s.url));
	// Seeded from the persisted value so a restored-expanded panel does not play its
	// intro on load; the effect below keeps it in sync afterwards.
	let isReasoningVisible = $state(untrack(() => message.isReasoningVisible) ?? false);
	let userHasInteractedWithToggle = $state(false);

	/** Oldest first: the recorded steps, then the round still being written. The last round lives in `reasoning` rather than the trace, but belongs at the end of the same list, which stops it jumping when a second round pushes it into history. */
	const steps = $derived([
		// Messages written before the trace existed still know they searched.
		...(message.reasoningTrace ??
			(message.webSearch
				? [
						{
							type: 'search' as const,
							query: message.webSearch.query,
							resultCount: message.webSearch.resultCount
						}
					]
				: [])),
		...(message.reasoning ? [{ type: 'reasoning' as const, content: message.reasoning }] : [])
	]);

	/** The steps are still running: the answer itself hasn't started yet. */
	const isThinking = $derived(isStreamingArticle && !currentRawCompletion?.trim());

	/** Closed as soon as the answer starts rather than when the stream ends: the first token is the moment the steps are over. */
	const showDone = $derived(steps.length > 0 && !isThinking);

	/** What it is doing, or (once done) what it did. */
	const activityLabel = $derived.by(() => {
		if (isSearching) {
			if (searchActivity === 'read') return $LL.readingPages();
			if (searchActivity === 'tool') return $LL.callingExternalTool();
			return $LL.searchingTheWeb();
		}
		if (isThinking && message.reasoning) return $LL.thinkingActivity();

		const done: string[] = [];
		if (steps.some((s) => s.type === 'search')) done.push($LL.searchedTheWeb());
		const pages = steps.find((s) => s.type === 'read')?.pages?.length;
		if (pages) done.push($LL.pagesRead({ count: pages }));
		return done.length ? done.join(' · ') : $LL.reasoning();
	});

	/** What a memory step did, in the user's language rather than the tool's. */
	function memoryLabel(memory: ReasoningStep['memory']): string {
		if (!memory) return $LL.memoryStepKept();
		if (memory.refused) return $LL.memoryStepRefused();
		switch (memory.action) {
			case 'profile':
				return $LL.memoryStepProfile();
			case 'forget':
				return $LL.memoryStepForgot();
			case 'read':
				return $LL.memoryStepRead();
			default:
				return $LL.memoryStepKept();
		}
	}

	/** The server's name is not decoration: a result from somebody else's server is a different kind of thing from one the app produced. */
	function mcpLabel(mcp: ReasoningStep['mcp']): string {
		if (!mcp) return $LL.mcpStepCalled();
		// A refusal first: it is the only one where nothing left the machine, and
		// reading it as a failure would be reading it backwards.
		if (mcp.refused) return $LL.mcpStepRefused();
		if (!mcp.tool) return $LL.mcpStepUnavailable();
		return mcp.failed ? $LL.mcpStepFailed() : $LL.mcpStepCalled();
	}

	function toggleReasoningVisibility() {
		isReasoningVisible = !isReasoningVisible;
		userHasInteractedWithToggle = true;
		if (isStreamingArticle) {
			// Live article: hand the state to the parent so it can carry over on completion.
			streamingReasoningExpanded = isReasoningVisible;
		} else {
			// Completed message: persist the choice on the message and let the parent save.
			message.isReasoningVisible = isReasoningVisible;
			onToggleReasoning?.();
		}
	}

	// Follow-along: the timeline unfolds as the steps land and folds once the answer
	// starts. Only while streaming, and only until the user works the toggle.
	$effect(() => {
		if (!$settingsStore.autoExpandReasoningBlocks) return;
		if (isStreamingArticle && !userHasInteractedWithToggle) {
			// Any step counts, not just thinking: a search is the first thing that happens
			// in a turn.
			const hasReasoning = steps.length > 0 || !!currentRawReasoning?.trim();
			const hasCompletion = !!currentRawCompletion?.trim();

			if (hasReasoning && !hasCompletion) {
				isReasoningVisible = true;
			} else if (hasCompletion) {
				isReasoningVisible = false;
			}
		}
	});

	// Completed (non-streaming) messages reflect the visibility persisted on the message.
	$effect(() => {
		if (!isStreamingArticle) {
			isReasoningVisible = message.isReasoningVisible ?? false;
		}
	});

	/** Bare hostname for a source pill, e.g. "example.com". */
	function domainOf(url: string): string {
		try {
			return new URL(url).hostname.replace(/^www\./, '');
		} catch {
			return url;
		}
	}

	/** Favicon URL for a source (DuckDuckGo's icon service; falls back to hidden on error). */
	function faviconOf(url: string): string {
		try {
			return `https://icons.duckduckgo.com/ip3/${new URL(url).hostname}.ico`;
		} catch {
			return '';
		}
	}
</script>

{#if isDocumentAttachment && message.document}
	<!-- The document as it was attached, not as the model reads it: a hundred pages
	     of Markdown would bury the conversation. The text is still in the message. -->
	<div class="mx-auto mb-2 flex w-full max-w-[80ch] justify-end px-3 md:px-4 lg:px-6">
		<AttachmentPill
			attachment={{
				type: 'document',
				id: anchorId ?? message.document.name,
				name: message.document.name,
				markdown: '',
				tokens: 0,
				pages: message.document.pages
			}}
			onSave={() => openKnowledge({ name: message.document?.name ?? '', content: message.content })}
		/>
	</div>
{:else if isKnowledgeAttachment}
	<article
		class="attachment border-shade-3 mx-auto mb-2 flex w-full max-w-[80ch] items-center justify-between gap-2 rounded-md border px-3 py-1 md:px-4 lg:px-6"
		class:folded
	>
		<div class="attachment__content flex items-center gap-2">
			<div class="attachment__icon text-muted">
				<Brain class="base-icon" />
			</div>
			<div class="attachment__name text-sm">
				<Button variant="link" onclick={() => openKnowledge({ id: message.knowledge?.id })}>
					{message.knowledge?.name}
				</Button>
			</div>
		</div>
		<div class="attachment__interactive -mr-2 md:-mr-3">
			<Button
				variant="icon"
				onclick={() => handleDeleteAttachment && handleDeleteAttachment(message)}
			>
				<Trash2 class="base-icon" />
			</Button>
		</div>
	</article>
{:else}
	<!-- Two shapes, not one: the assistant answers as prose across the column, the
	     user speaks in a bubble pushed right. Identical cards turned a long
	     conversation into a wall of boxes. -->
	<article
		id={anchorId}
		class:folded
		class="article article--{message.role} mx-auto mb-4 flex w-full max-w-[80ch] flex-col gap-y-2 last:mb-0 md:mb-6 {isUserRole
			? 'items-end'
			: ''} {message.role === 'system' ? 'border-shade-3 rounded-md border p-3 md:p-4' : ''}"
	>
		<!-- Identity only: who spoke and when. Mirrored for the user, so the badge hugs
		     the message's outer edge on both sides. -->
		<nav
			class="article__nav text-muted flex items-center gap-2 {isUserRole ? 'flex-row-reverse' : ''}"
		>
			{#if speaker}
				<PersonaAvatar persona={speaker} size={20} />
			{/if}
			<div
				data-testid="session-role"
				class="article__role text-center text-xs leading-7 font-bold uppercase"
			>
				<!-- A persona called in with `@` answers as itself. Read from the message rather
				     than the library: the name has to keep working after the persona is gone. -->
				<Badge>
					{#if isUserRole}
						{$LL.you()}
					{:else if message.role === 'assistant'}
						{speakerName || assistantLabel || $LL.assistant()}
					{:else}
						{$LL.system()}
					{/if}
				</Badge>
			</div>
			{#if sentAt}
				<!-- Revealed on hover, like the message's own actions. Stays visible where there
				     is no hover to reveal it with. -->
				<span
					class="article__sent-at text-muted shrink-0 text-[11px] tabular-nums"
					title={message.createdAt}
				>
					{sentAt}
				</span>
			{/if}
		</nav>

		<!-- Everything the turn did before answering, under one heading. Each of these
		     used to be its own widget replacing the previous one, so the article
		     flickered and only the last round survived. One list, appended to. -->
		{#if steps.length || isSearching}
			<div class="activity text-xs">
				<button
					class="activity__button text-muted hover:text-active flex max-w-full items-center gap-1.5 rounded py-1 transition-colors"
					onclick={toggleReasoningVisibility}
					aria-expanded={isReasoningVisible}
					disabled={!steps.length}
				>
					<span class="truncate {isSearching ? 'animate-pulse' : ''}">{activityLabel}</span>
					{#if isSearching && searchQuery}
						<span class="bg-shade-2 truncate rounded-full px-2 py-0.5">{searchQuery}</span>
					{/if}
					{#if steps.length}
						{#if isReasoningVisible}
							<ChevronUp class="h-3.5 w-3.5 shrink-0" />
						{:else}
							<ChevronDown class="h-3.5 w-3.5 shrink-0" />
						{/if}
					{/if}
				</button>

				{#if isReasoningVisible && steps.length}
					<div
						class="activity__timeline mt-0.5 flex flex-col"
						transition:slide={{ easing: quadInOut, duration: 200 }}
					>
						{#each steps as step, i (i)}
							<div class="flex gap-2">
								<!-- The icon says what the step is; the rule under it ties them into one
								     sequence rather than a stack. -->
								<div class="text-muted flex w-4 shrink-0 flex-col items-center">
									{#if step.type === 'reasoning'}
										<Brain class="mt-1 h-3.5 w-3.5 shrink-0" />
									{:else if step.type === 'search'}
										<Globe class="mt-1 h-3.5 w-3.5 shrink-0" />
									{:else if step.type === 'memory'}
										<BookMarked class="mt-1 h-3.5 w-3.5 shrink-0" />
									{:else if step.type === 'mcp'}
										<Plug class="mt-1 h-3.5 w-3.5 shrink-0" />
									{:else}
										<FileText class="mt-1 h-3.5 w-3.5 shrink-0" />
									{/if}
									{#if i < steps.length - 1 || showDone}
										<div class="bg-shade-3 my-1 w-px flex-1"></div>
									{/if}
								</div>

								<div class="min-w-0 flex-1 {i < steps.length - 1 || showDone ? 'pb-2' : ''}">
									{#if step.type === 'reasoning'}
										<!-- The step being written is unclamped: its newest text is at the bottom, which
										     is exactly what a clamp would hide. -->
										<ActivityText clamp={!(isThinking && i === steps.length - 1)}>
											<article class="article--reasoning text-muted">
												<Markdown markdown={step.content ?? ''} />
											</article>
										</ActivityText>
									{:else if step.type === 'search'}
										<div class="text-muted flex flex-wrap items-center gap-1.5 py-0.5">
											{#if step.query}
												<span class="bg-shade-2 rounded-full px-2 py-0.5">{step.query}</span>
											{/if}
											<span>
												{step.resultCount
													? $LL.searchResults({ count: step.resultCount })
													: $LL.noWebResults()}
											</span>
										</div>
									{:else if step.type === 'memory'}
										<!-- Shown for the same reason a search is: something was done on the user's
										     behalf that they did not ask for. Refusals too, since "it tried and could
										     not" is what somebody wondering needs. -->
										<div class="text-muted flex flex-wrap items-center gap-1.5 py-0.5">
											<span>{memoryLabel(step.memory)}</span>
											{#if step.memory?.title}
												<span class="bg-shade-2 max-w-[15rem] truncate rounded-full px-2 py-0.5">
													{step.memory.title}
												</span>
											{/if}
										</div>
									{:else if step.type === 'mcp'}
										<!-- Named, not merely counted: which machine answered is the one thing that
										     separates this from the app's own tools. -->
										<div class="text-muted flex flex-wrap items-center gap-1.5 py-0.5">
											<span>{mcpLabel(step.mcp)}</span>
											{#if step.mcp?.server}
												<span class="bg-shade-2 max-w-[15rem] truncate rounded-full px-2 py-0.5">
													{step.mcp.server}
												</span>
											{/if}
											{#if step.mcp?.tool}
												<span class="bg-shade-2 max-w-[15rem] truncate rounded-full px-2 py-0.5">
													{step.mcp.tool}
												</span>
											{/if}
										</div>
									{:else}
										<div class="text-muted flex flex-wrap items-center gap-1.5 py-0.5">
											{#if step.pages?.length}
												<span>{$LL.pagesRead({ count: step.pages.length })}</span>
												{#each step.pages as page, p (page.url + p)}
													<a
														href={page.url}
														target="_blank"
														rel="noreferrer external"
														title={page.title || page.url}
														class="border-shade-3 bg-shade-1 hover:border-accent hover:text-active max-w-[15rem] truncate rounded-full border px-2 py-0.5 transition-colors"
													>
														{domainOf(page.url)}
													</a>
												{/each}
											{:else}
												<span>{$LL.pagesReadFailed()}</span>
											{/if}
										</div>
									{/if}
								</div>
							</div>
						{/each}

						<!-- The timeline needs an end, or the last step reads as one cut short. -->
						{#if showDone}
							<div class="flex gap-2">
								<div class="text-muted flex w-4 shrink-0 flex-col items-center">
									<Check class="mt-1 h-3.5 w-3.5 shrink-0" />
								</div>
								<div class="text-muted min-w-0 flex-1 py-0.5">{$LL.activityDone()}</div>
							</div>
						{/if}
					</div>
				{/if}
			</div>
		{/if}
		{#if preparingChoices}
			<div class="ask-skeleton flex flex-col gap-2">
				<span class="text-muted animate-pulse text-sm">{$LL.preparingOptions()}…</span>
				<div class="flex flex-wrap gap-1.5">
					{#each [0, 1, 2] as i (i)}
						<span class="bg-shade-2 h-8 w-24 animate-pulse rounded-full"></span>
					{/each}
				</div>
			</div>
		{:else if message.content}
			{#if isUserRole}
				<!-- Tinted with the accent so your own turns are findable when scanning back;
				     Interface can turn it off for a plainer thread. -->
				<div
					class="article__bubble max-w-[85%] rounded-2xl rounded-tr-sm px-3.5 py-2.5 {$settingsStore.accentUserMessages
						? 'bg-accent/10'
						: 'bg-shade-2'}"
				>
					<!-- The names you called, drawn as labels. Segments rather than markup, for the
					     reason the search excerpts give: content turned into HTML would hand any
					     conversation containing markup a way into the page. -->
					{#if mentionSegments.length > 1}
						<p class="text-sm leading-relaxed whitespace-pre-wrap">
							{#each mentionSegments as segment, i (i)}
								{#if segment.kind === 'mention'}
									<span class="text-accent font-medium">{segment.text}</span>
								{:else}
									{segment.text}
								{/if}
							{/each}
						</p>
					{:else}
						<Markdown markdown={message.content} />
					{/if}
				</div>
			{:else}
				<Markdown markdown={message.content} {citations} />
			{/if}
		{:else if isStreamingArticle}
			<!-- Streaming has started but no token has landed yet. -->
			<ThinkingIndicator />
		{/if}

		{#if message.webSearch?.sources?.length}
			<div class="article__sources mt-3 flex flex-col gap-1.5">
				<span class="text-muted flex items-center gap-1.5 text-xs font-medium">
					<Globe class="h-3 w-3 shrink-0" />
					Sources · {message.webSearch.sources.length}
				</span>
				<div class="flex flex-wrap gap-1.5">
					{#each message.webSearch.sources as source, i (source.url + i)}
						<a
							href={source.url}
							target="_blank"
							rel="noreferrer external"
							title={source.title || source.url}
							class="border-shade-3 bg-shade-1 text-muted hover:border-accent hover:text-active flex max-w-[15rem] items-center gap-1.5 rounded-full border py-1 pr-2.5 pl-1.5 text-xs transition-colors"
						>
							<span
								class="bg-shade-2 flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[9px] font-semibold"
							>
								{i + 1}
							</span>
							<img
								src={faviconOf(source.url)}
								alt=""
								class="h-3.5 w-3.5 shrink-0 rounded-sm"
								loading="lazy"
								onerror={(e) => ((e.currentTarget as HTMLImageElement).style.display = 'none')}
							/>
							<span class="truncate">{domainOf(source.url)}</span>
						</a>
					{/each}
				</div>
			</div>
		{/if}

		{#if message.choices && onChoose}
			<AskChoices choices={message.choices} {onChoose} />
		{/if}
		{#if message.images && message.images.length}
			<div class="article__images mt-2 flex flex-wrap gap-1">
				{#each message.images as img (img.filename)}
					<!-- The same pill it was attached as, minus the way to take it back. -->
					<AttachmentPill
						attachment={{
							type: 'image',
							id: img.filename,
							name: img.filename,
							dataUrl: `data:image/png;base64,${img.data}`
						}}
					/>
				{/each}
			</div>
		{/if}

		<!-- Actions hang under the message they act on, along its own edge, so they read
		     as belonging to that turn rather than to a corner of the thread. -->
		{#if !isStreamingArticle}
			<div class="article__interactive -mt-0.5 flex items-center gap-0.5">
				{#if retryIndex !== undefined}
					<Button
						title={$LL.retry()}
						variant="icon-sm"
						id="retry-index-{retryIndex}"
						onclick={() => handleRetry && handleRetry(retryIndex)}
					>
						<RefreshCw class="h-3.5 w-3.5" />
					</Button>
				{/if}
				{#if isUserRole}
					<Button
						title={$LL.edit()}
						variant="icon-sm"
						onclick={() => handleEditMessage && handleEditMessage(message)}
					>
						<Pencil class="h-3.5 w-3.5" />
					</Button>
				{/if}
				<ButtonCopy content={message.content} compact />

				<!-- Removing one turn, which the conversation had no way to do: everything that
				     deleted anything deleted the whole conversation.

				     It asks first, and asks here rather than in a dialog, the way the sidebar's
				     rows do. Nothing else moves while it waits. -->
				{#if handleDeleteMessage}
					{#if confirmingDelete}
						<Button
							title={$LL.confirmDeletion()}
							variant="icon-sm"
							class="text-negative"
							onclick={() => {
								confirmingDelete = false;
								handleDeleteMessage?.(message);
							}}
						>
							<Check class="h-3.5 w-3.5" />
						</Button>
						<Button
							title={$LL.cancel()}
							variant="icon-sm"
							onclick={() => (confirmingDelete = false)}
						>
							<X class="h-3.5 w-3.5" />
						</Button>
					{:else}
						<Button
							title={$LL.deleteMessage()}
							variant="icon-sm"
							onclick={() => (confirmingDelete = true)}
						>
							<Trash2 class="h-3.5 w-3.5" />
						</Button>
					{/if}
				{/if}
			</div>
		{/if}
	</article>
{/if}

<style lang="postcss">
	/** A message a summary stands in for: still part of the conversation and still readable, simply no longer what the model answers from. Full strength on hover, when it matters. */
	.folded {
		opacity: 0.45;
		transition: opacity 0.25s ease;
	}

	.folded:hover,
	.folded:focus-within {
		opacity: 1;
	}

	@media (hover: hover) {
		.article__interactive,
		.attachment__interactive,
		.article__sent-at {
			opacity: 0;
			transition: opacity 0.15s ease;
		}

		.article:hover .article__interactive,
		.attachment:hover .attachment__interactive,
		.article:hover .article__sent-at,
		.article:focus-within .article__sent-at {
			opacity: 1;
		}
	}
</style>
