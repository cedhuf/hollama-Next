<script lang="ts">
	import {
		Brain,
		ChevronDown,
		ChevronUp,
		FileText,
		Globe,
		Pencil,
		RefreshCw,
		Trash2
	} from '@lucide/svelte';
	import { untrack } from 'svelte';
	import { quadInOut } from 'svelte/easing';
	import { slide } from 'svelte/transition';

	import LL from '$i18n/i18n-svelte';
	import Badge from '$lib/components/Badge.svelte';
	import Button from '$lib/components/Button.svelte';
	import ButtonCopy from '$lib/components/ButtonCopy.svelte';
	import { generateNewUrl } from '$lib/components/ButtonNew';
	import Markdown from '$lib/components/Markdown.svelte';
	import ThinkingIndicator from '$lib/components/ThinkingIndicator.svelte';
	import { settingsStore } from '$lib/localStorage';
	import { type Message } from '$lib/sessions';
	import { Sitemap } from '$lib/sitemap';

	import AskChoices from './AskChoices.svelte';
	import AttachmentImage from './AttachmentImage.svelte';

	let {
		message,
		retryIndex = undefined,
		handleRetry = undefined,
		handleEditMessage = undefined,
		handleDeleteAttachment = undefined,
		onChoose = undefined,
		isStreamingArticle = false,
		isSearching = false,
		searchActivity = undefined,
		searchQuery = undefined,
		preparingChoices = false,
		assistantLabel = undefined,
		currentRawReasoning,
		currentRawCompletion,
		streamingReasoningExpanded = $bindable(false),
		onToggleReasoning = undefined
	}: {
		message: Message;
		retryIndex?: number;
		handleRetry?: (index: number) => void;
		handleEditMessage?: (message: Message) => void;
		handleDeleteAttachment?: (message: Message) => void;
		/** Called with the picked option(s) when the message has quick-choice buttons. */
		onChoose?: (selected: string[][]) => void;
		isStreamingArticle?: boolean;
		isSearching?: boolean;
		/** Whether the running lookup is a search or a page read — they read differently. */
		searchActivity?: 'search' | 'read';
		searchQuery?: string;
		/** True while the model is streaming an <ask> block — show a choices skeleton. */
		preparingChoices?: boolean;
		/** Label for assistant bubbles — the persona's name when in a persona chat. */
		assistantLabel?: string;
		currentRawReasoning?: string;
		currentRawCompletion?: string;
		/** Two-way bound to the parent only for the live (streaming) article. */
		streamingReasoningExpanded?: boolean;
		/** Called after the user toggles a completed message, so the parent can persist. */
		onToggleReasoning?: () => void;
	} = $props();

	const isKnowledgeAttachment = $derived(message.knowledge?.name !== undefined);
	const isUserRole = $derived(message.role === 'user' && !isKnowledgeAttachment);
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
	// Seed from the persisted value (initial only) so a restored-expanded panel doesn't
	// play its intro animation on load; the effect below keeps it in sync afterwards.
	let isReasoningVisible = $state(untrack(() => message.isReasoningVisible) ?? false);
	let userHasInteractedWithToggle = $state(false);

	/**
	 * The timeline, oldest first: the recorded steps, then the round still being
	 * written. The last round lives in `reasoning` rather than in the trace — it is
	 * still streaming — but it belongs at the end of the same list, which is what
	 * keeps it from jumping when a second round pushes it into history.
	 */
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

	/** What it is doing, or — once done — what it did. */
	const activityLabel = $derived.by(() => {
		if (isSearching) return searchActivity === 'read' ? $LL.readingPages() : $LL.searchingTheWeb();
		if (isStreamingArticle && message.reasoning && !currentRawCompletion?.trim())
			return $LL.thinkingActivity();

		const done: string[] = [];
		if (steps.some((s) => s.type === 'search')) done.push($LL.searchedTheWeb());
		const pages = steps.find((s) => s.type === 'read')?.pages?.length;
		if (pages) done.push($LL.pagesRead({ count: pages }));
		return done.length ? done.join(' · ') : $LL.reasoning();
	});

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

	// While streaming, auto-expand the reasoning panel — but only when the setting is on
	// and the user hasn't manually overridden the toggle this turn.
	$effect(() => {
		if (!$settingsStore.autoExpandReasoningBlocks) return;
		if (isStreamingArticle && !userHasInteractedWithToggle) {
			const hasReasoning = !!currentRawReasoning?.trim();
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

{#if isKnowledgeAttachment}
	<article
		class="attachment mx-auto mb-2 flex w-full max-w-[80ch] gap-2 rounded-md border border-shade-3 flex items-center justify-between px-3 py-1 md:px-4 lg:px-6"
	>
		<div class="attachment__content flex items-center gap-2">
			<div class="attachment__icon text-muted">
				<Brain class="base-icon" />
			</div>
			<div class="attachment__name text-sm">
				<Button variant="link" href={generateNewUrl(Sitemap.KNOWLEDGE, message.knowledge?.id)}>
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
	<!-- Two shapes, not one: the assistant answers as plain prose across the column,
	     the user speaks in a bubble pushed to the right. Identical cards for both
	     turned a long conversation into a wall of boxes where the eye couldn't find
	     who said what. -->
	<article
		class="article article--{message.role} mx-auto mb-4 flex w-full max-w-[80ch] flex-col gap-y-2 last:mb-0 md:mb-6 {isUserRole
			? 'items-end'
			: ''} {message.role === 'system' ? 'rounded-md border border-shade-3 p-3 md:p-4' : ''}"
	>
		<!-- Header carries identity only: who spoke and when. Mirrored for the user so
		     the badge always hugs the message's outer edge and the time sits inward,
		     on both sides of the thread. -->
		<nav
			class="article__nav flex items-center gap-2 text-muted {isUserRole ? 'flex-row-reverse' : ''}"
		>
			<div
				data-testid="session-role"
				class="article__role text-center text-xs font-bold uppercase leading-7"
			>
				<Badge>
					{#if isUserRole}
						{$LL.you()}
					{:else if message.role === 'assistant'}
						{assistantLabel || $LL.assistant()}
					{:else}
						{$LL.system()}
					{/if}
				</Badge>
			</div>
			{#if sentAt}
				<!-- Information, not an action: it stays put rather than hiding in the
				     hover-only group, where it was invisible until you went looking. -->
				<span class="shrink-0 text-[11px] tabular-nums text-muted" title={message.createdAt}>
					{sentAt}
				</span>
			{/if}
		</nav>

		<!-- Everything the turn did before answering, under one heading: searching,
		     thinking, reading, thinking again. Each of these used to be its own widget
		     appearing and replacing the previous one, so the article flickered while it
		     worked and only the last round survived. One list, appended to. -->
		{#if steps.length || isSearching}
			<div class="activity text-xs">
				<button
					class="activity__button flex max-w-full items-center gap-1.5 rounded py-1 text-muted transition-colors hover:text-active"
					onclick={toggleReasoningVisibility}
					aria-expanded={isReasoningVisible}
					disabled={!steps.length}
				>
					<span class="truncate {isSearching ? 'animate-pulse' : ''}">{activityLabel}</span>
					{#if isSearching && searchQuery}
						<span class="truncate rounded-full bg-shade-2 px-2 py-0.5">{searchQuery}</span>
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
								<!-- Gutter: the icon says what the step is, the rule under it ties the
								     steps together so they read as one sequence rather than as a stack. -->
								<div class="flex w-4 shrink-0 flex-col items-center text-muted">
									{#if step.type === 'reasoning'}
										<Brain class="mt-1 h-3.5 w-3.5 shrink-0" />
									{:else if step.type === 'search'}
										<Globe class="mt-1 h-3.5 w-3.5 shrink-0" />
									{:else}
										<FileText class="mt-1 h-3.5 w-3.5 shrink-0" />
									{/if}
									{#if i < steps.length - 1}
										<div class="my-1 w-px flex-1 bg-shade-3"></div>
									{/if}
								</div>

								<div class="min-w-0 flex-1 {i < steps.length - 1 ? 'pb-2' : ''}">
									{#if step.type === 'reasoning'}
										<article class="article--reasoning text-muted">
											<Markdown markdown={step.content ?? ''} />
										</article>
									{:else if step.type === 'search'}
										<div class="flex flex-wrap items-center gap-1.5 py-0.5 text-muted">
											{#if step.query}
												<span class="rounded-full bg-shade-2 px-2 py-0.5">{step.query}</span>
											{/if}
											<span>
												{step.resultCount
													? $LL.searchResults({ count: step.resultCount })
													: $LL.noWebResults()}
											</span>
										</div>
									{:else}
										<div class="flex flex-wrap items-center gap-1.5 py-0.5 text-muted">
											{#if step.pages?.length}
												<span>{$LL.pagesRead({ count: step.pages.length })}</span>
												{#each step.pages as page, p (page.url + p)}
													<a
														href={page.url}
														target="_blank"
														rel="noreferrer external"
														title={page.title || page.url}
														class="max-w-[15rem] truncate rounded-full border border-shade-3 bg-shade-1 px-2 py-0.5 transition-colors hover:border-accent hover:text-active"
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
					</div>
				{/if}
			</div>
		{/if}
		{#if preparingChoices}
			<div class="ask-skeleton flex flex-col gap-2">
				<span class="animate-pulse text-sm text-muted">{$LL.preparingOptions()}…</span>
				<div class="flex flex-wrap gap-1.5">
					{#each [0, 1, 2] as i (i)}
						<span class="h-8 w-24 animate-pulse rounded-full bg-shade-2"></span>
					{/each}
				</div>
			</div>
		{:else if message.content}
			{#if isUserRole}
				<!-- Tinted with the app's accent by default so your own turns are findable
				     when scanning back through a long conversation; Interface can turn it
				     off for a plainer, lower-contrast thread. -->
				<div
					class="max-w-[85%] rounded-2xl rounded-tr-sm px-3.5 py-2.5 {$settingsStore.accentUserMessages
						? 'bg-accent/10'
						: 'bg-shade-2'}"
				>
					<Markdown markdown={message.content} />
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
				<span class="flex items-center gap-1.5 text-xs font-medium text-muted">
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
							class="flex max-w-[15rem] items-center gap-1.5 rounded-full border border-shade-3 bg-shade-1 py-1 pl-1.5 pr-2.5 text-xs text-muted transition-colors hover:border-accent hover:text-active"
						>
							<span
								class="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-shade-2 text-[9px] font-semibold"
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
					<AttachmentImage dataUrl={`data:image/png;base64,${img.data}`} name={img.filename} />
				{/each}
			</div>
		{/if}

		<!-- Actions hang under the message they act on, along its own edge — the same
		     rule for both roles, so they read as belonging to that turn rather than
		     sitting at some fixed corner of the thread. Small and muted: they are
		     always secondary to the text. -->
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
			</div>
		{/if}
	</article>
{/if}

<style lang="postcss">
	@media (hover: hover) {
		.article__interactive,
		.attachment__interactive {
			opacity: 0;
			transition: opacity 0.15s ease;
		}

		.article:hover .article__interactive,
		.attachment:hover .attachment__interactive {
			opacity: 1;
		}
	}
</style>
