<script lang="ts">
	import { Brain, ChevronDown, ChevronUp, Globe, Pencil, RefreshCw, Trash2 } from '@lucide/svelte';
	import { quadInOut } from 'svelte/easing';
	import { slide } from 'svelte/transition';

	import LL from '$i18n/i18n-svelte';
	import Badge from '$lib/components/Badge.svelte';
	import Button from '$lib/components/Button.svelte';
	import ButtonCopy from '$lib/components/ButtonCopy.svelte';
	import { generateNewUrl } from '$lib/components/ButtonNew';
	import Markdown from '$lib/components/Markdown.svelte';
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
		searchQuery = undefined,
		preparingChoices = false,
		assistantLabel = undefined,
		currentRawReasoning,
		currentRawCompletion
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
		searchQuery?: string;
		/** True while the model is streaming an <ask> block — show a choices skeleton. */
		preparingChoices?: boolean;
		/** Label for assistant bubbles — the persona's name when in a persona chat. */
		assistantLabel?: string;
		currentRawReasoning?: string;
		currentRawCompletion?: string;
	} = $props();

	const isKnowledgeAttachment = $derived(message.knowledge?.name !== undefined);
	const isUserRole = $derived(message.role === 'user' && !isKnowledgeAttachment);
	// URLs indexed by citation number, so the answer's inline [n] become links.
	const citations = $derived(message.webSearch?.sources?.map((s) => s.url));
	let isReasoningVisible = $state(false);
	let userHasInteractedWithToggle = $state(false);

	function toggleReasoningVisibility() {
		isReasoningVisible = !isReasoningVisible;
		userHasInteractedWithToggle = true;
	}

	$effect(() => {
		if (isStreamingArticle && !userHasInteractedWithToggle) {
			const hasReasoning = currentRawReasoning && currentRawReasoning.trim() !== '';
			const hasCompletion = currentRawCompletion && currentRawCompletion.trim() !== '';

			if (hasReasoning && !hasCompletion) {
				isReasoningVisible = true;
			} else if (hasCompletion) {
				isReasoningVisible = false;
			}
		}
	});

	// Reset user interaction state if this component instance is reused for a non-streaming to streaming transition
	// or if the message fundamentally changes, indicating a new context.
	$effect(() => {
		if (!isStreamingArticle) {
			userHasInteractedWithToggle = false;
			// Also ensure reasoning is collapsed for non-streaming articles by default unless it already has content
			if (!message.reasoning || message.reasoning.trim() === '') {
				isReasoningVisible = false;
			}
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
	<article
		class="article article--{message.role} mx-auto mb-2 flex w-full max-w-[80ch] flex-col gap-y-2 rounded-md border border-shade-3 p-3 md:mb-4 md:gap-y-4 md:p-4 lg:mb-6 lg:p-6 last:mb-0 {message.role ===
		'assistant'
			? 'border-transparent bg-shade-0'
			: ''}"
	>
		<nav class="article__nav flex items-center justify-between text-muted -mt-1">
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
			<div class="article__interactive -mr-2 md:-mr-3">
				{#if retryIndex}
					<Button
						title={$LL.retry()}
						variant="icon"
						id="retry-index-{retryIndex}"
						onclick={() => handleRetry && handleRetry(retryIndex)}
					>
						<RefreshCw class="base-icon" />
					</Button>
				{/if}
				{#if isUserRole}
					<Button
						title={$LL.edit()}
						variant="icon"
						onclick={() => handleEditMessage && handleEditMessage(message)}
					>
						<Pencil class="base-icon" />
					</Button>
				{/if}
				<ButtonCopy content={message.content} />
			</div>
		</nav>

		{#if isSearching}
			<div class="article__search flex flex-wrap items-center gap-1.5 text-xs text-muted">
				<Globe class="h-3 w-3 shrink-0 animate-pulse" />
				<span class="animate-pulse">Searching the web</span>
				{#if searchQuery}
					<span class="rounded-full bg-shade-2 px-2 py-0.5 text-muted">{searchQuery}</span>
				{/if}
			</div>
		{:else if message.webSearch && message.webSearch.resultCount === 0}
			<div class="article__search flex items-center gap-1.5 text-xs text-muted">
				<Globe class="h-3 w-3 shrink-0" />
				<span title={`Query: “${message.webSearch.query}”`}>No web results found</span>
			</div>
		{/if}

		{#if message.reasoning}
			<div
				class="reasoning rounded bg-shade-1 text-xs"
				transition:slide={{ easing: quadInOut, duration: 200 }}
			>
				<button
					class="reasoning__button flex w-full items-center justify-between gap-2 p-2"
					onclick={toggleReasoningVisibility}
				>
					{$LL.reasoning()}
					{#if isReasoningVisible}
						<ChevronUp class="base-icon" />
					{:else}
						<ChevronDown class="base-icon" />
					{/if}
				</button>
				{#if isReasoningVisible}
					<article
						class="article article--reasoning mx-auto mb-2 flex w-full max-w-[80ch] flex-col gap-y-2 rounded-md border border-shade-3 p-3 md:mb-4 md:gap-y-4 md:p-4 lg:mb-6 lg:p-6 last:mb-0 max-w-full border-b-0 border-l-0 border-r-0"
						transition:slide={{ easing: quadInOut, duration: 200 }}
					>
						<Markdown markdown={message.reasoning} />
					</article>
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
			<Markdown markdown={message.content} {citations} />
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
							rel="noreferrer"
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
