<script lang="ts">
	import { CornerDownLeft, Layers, Search, X } from '@lucide/svelte';
	import { tick } from 'svelte';

	import LL from '$i18n/i18n-svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import Kbd from '$lib/components/Kbd.svelte';
	import Modal from '$lib/components/Modal.svelte';
	import { splitExcerpt, type ConversationResult } from '$lib/conversationSearch';
	import { repository } from '$lib/data';
	import { formatTimestampToNow } from '$lib/utils';

	/**
	 * Searching the content of every conversation.
	 *
	 * Distinct from the sidebar field, which filters the visible list by title:
	 * this queries the whole corpus and answers with the passages themselves. A
	 * conversation that mentions a term eight times shows eight ways in, so the
	 * result is somewhere to read, not just somewhere to click.
	 */
	interface Props {
		open: boolean;
		/** Seeded from the sidebar when arriving through "search everywhere". */
		initialQuery?: string;
	}

	let { open = $bindable(false), initialQuery = '' }: Props = $props();

	const DEBOUNCE_MS = 200;

	let query = $state('');
	let results = $state<ConversationResult[]>([]);
	let loading = $state(false);
	let failed = $state(false);
	let selected = $state(0);
	let input = $state<HTMLInputElement>();
	let list = $state<HTMLDivElement>();

	/**
	 * Every match as one flat sequence, so the arrow keys move between passages
	 * rather than between conversations: the conversation heading is a grouping,
	 * not a stop.
	 */
	const rows = $derived(
		results.flatMap((result, resultIndex) =>
			result.matches.map((match, matchIndex) => ({ result, match, resultIndex, matchIndex }))
		)
	);

	// Opening seeds from the sidebar and focuses; closing forgets, so the next
	// open is a fresh search rather than a stale answer.
	$effect(() => {
		if (!open) return;
		query = initialQuery;
		selected = 0;
		void tick().then(() => input?.focus());
	});

	$effect(() => {
		if (!open) {
			results = [];
			failed = false;
			loading = false;
		}
	});

	/**
	 * Whether to answer from the whole transcript or only from what is live.
	 *
	 * Off by default. A compaction summary repeats what is said elsewhere, so it
	 * doubles every result it touches, and a conversation you cleared is one you
	 * deliberately set aside. Neither is what you are looking for, until it is,
	 * which is what this is for rather than a reason to search everything always.
	 */
	let everything = $state(false);

	let timer: ReturnType<typeof setTimeout>;
	$effect(() => {
		const current = query.trim();
		// Read so the search re-runs when the switch moves, not only when typing.
		const all = everything;
		clearTimeout(timer);

		if (!current) {
			results = [];
			loading = false;
			failed = false;
			return;
		}

		loading = true;
		timer = setTimeout(async () => {
			try {
				results = await repository.searchSessions(current, all);
				failed = false;
			} catch {
				results = [];
				failed = true;
			} finally {
				loading = false;
				selected = 0;
			}
		}, DEBOUNCE_MS);

		return () => clearTimeout(timer);
	});

	async function move(delta: number) {
		if (!rows.length) return;
		selected = (selected + delta + rows.length) % rows.length;
		await tick();
		list
			?.querySelector<HTMLElement>('[data-selected="true"]')
			?.scrollIntoView({ block: 'nearest' });
	}

	function openRow(index: number) {
		const row = rows[index];
		if (!row) return;
		open = false;
		// The message index rides in the URL so the conversation can scroll to the
		// passage that was actually chosen, not just to the conversation.
		const target = new URL(
			resolve('/sessions/[id]', { id: row.result.sessionId }),
			window.location.origin
		);
		target.searchParams.set('m', String(row.match.messageIndex));
		// The route itself is resolved above; the rule only knows how to see that in a
		// literal argument, and cannot follow a URL carrying a query parameter.
		// eslint-disable-next-line svelte/no-navigation-without-resolve
		void goto(target);
	}

	function onKeydown(event: KeyboardEvent) {
		if (event.key === 'ArrowDown') {
			event.preventDefault();
			void move(1);
		} else if (event.key === 'ArrowUp') {
			event.preventDefault();
			void move(-1);
		} else if (event.key === 'Enter') {
			event.preventDefault();
			openRow(selected);
		}
	}
</script>

<Modal bind:open closeButton={false}>
	<div class="flex h-full w-full flex-col">
		<!-- The field is the title: a search dialog that opens with anything else at
		     the top makes you look for where to type. -->
		<div class="border-shade-3 flex items-center gap-3 border-b px-4 py-3">
			<Search class="text-muted h-4 w-4 shrink-0" />
			<input
				bind:this={input}
				bind:value={query}
				onkeydown={onKeydown}
				type="text"
				autocomplete="off"
				spellcheck="false"
				aria-label={$LL.searchConversations()}
				placeholder={$LL.searchConversationsPlaceholder()}
				class="placeholder:text-muted w-full bg-transparent text-base outline-none"
			/>
			{#if loading}
				<div
					class="border-shade-3 border-t-active h-3.5 w-3.5 shrink-0 animate-spin rounded-full border"
				></div>
			{/if}

			<!-- Beside the field rather than under the results: it changes what is
			     being searched, so it belongs with the question and not with the
			     answer. -->
			<button
				type="button"
				onclick={() => (everything = !everything)}
				aria-pressed={everything}
				title={$LL.searchEverything()}
				class="shrink-0 rounded-lg px-2 py-1 text-[11px] transition-colors {everything
					? 'bg-accent/10 text-accent'
					: 'text-muted hover:bg-shade-2 hover:text-active'}"
			>
				<Layers class="h-3.5 w-3.5" />
			</button>

			<!-- The way out, and it has to be here rather than in the dialog's own
			     corner: this content fills the frame from the top edge, so the built-in
			     close would land on the field. It was simply left off, which cost
			     nothing on a desktop where Escape is a key somebody's hand is already
			     near, and left a phone with no way out of a full-screen dialog at all. -->
			<button
				type="button"
				onclick={() => (open = false)}
				aria-label={$LL.close()}
				class="text-muted hover:bg-shade-2 hover:text-active shrink-0 rounded-lg p-1.5 transition-colors"
			>
				<X class="h-4 w-4" />
			</button>
		</div>

		<div bind:this={list} class="flex-1 overflow-y-auto px-2 py-2" role="listbox" tabindex="-1">
			{#if !query.trim()}
				<p class="text-muted px-3 py-8 text-center text-sm">{$LL.searchStart()}</p>
			{:else if failed}
				<p class="text-muted px-3 py-8 text-center text-sm">{$LL.genericError()}</p>
			{:else if !loading && !rows.length}
				<p class="text-muted px-3 py-8 text-center text-sm">{$LL.searchEmpty()}</p>
			{:else}
				{#each results as result, resultIndex (result.sessionId)}
					<!-- Heading, then its passages: title and date on one line so the
					     "which conversation, and when" question is answered before the eye
					     reaches the excerpts. -->
					<div class="mt-3 mb-1 flex items-baseline gap-3 px-3 first:mt-0">
						<span class="truncate text-sm font-semibold">
							{result.title || $LL.untitled()}
						</span>
						<span class="text-muted ml-auto shrink-0 text-xs tabular-nums">
							{result.updatedAt ? formatTimestampToNow(result.updatedAt) : ''}
						</span>
						<span class="text-muted shrink-0 text-xs">
							{$LL.searchMatches({ count: result.matches.length })}
						</span>
					</div>

					{#each result.matches as match, matchIndex (match.messageIndex)}
						{@const index = rows.findIndex(
							(row) => row.resultIndex === resultIndex && row.matchIndex === matchIndex
						)}
						<button
							type="button"
							role="option"
							aria-selected={index === selected}
							data-selected={index === selected}
							onclick={() => openRow(index)}
							onmouseenter={() => (selected = index)}
							class="flex w-full gap-2 rounded-md px-3 py-1.5 text-left text-sm leading-relaxed transition-colors {index ===
							selected
								? 'bg-shade-2'
								: 'hover:bg-shade-2/60'}"
						>
							<span class="text-muted w-16 shrink-0 truncate pt-0.5 text-[11px] uppercase">
								{match.role === 'user' ? $LL.you() : $LL.assistant()}
							</span>
							<span class="text-muted line-clamp-2 min-w-0 flex-1">
								<!-- The excerpt is message content, so it is only ever text nodes;
								     the marks come from the split, never from parsed markup. -->
								{#each splitExcerpt(match.excerpt) as segment, segmentIndex (segmentIndex)}
									{#if segment.match}
										<mark class="text-active rounded-sm bg-yellow-400/30">{segment.text}</mark>
									{:else}{segment.text}{/if}
								{/each}
							</span>
						</button>
					{/each}
				{/each}
			{/if}
		</div>

		<div
			class="border-shade-3 text-muted flex items-center gap-4 border-t px-4 py-2 text-[11px]"
			aria-hidden="true"
		>
			<span class="flex items-center gap-1"><Kbd>↑</Kbd><Kbd>↓</Kbd>{$LL.searchNavigate()}</span>
			<span class="flex items-center gap-1">
				<Kbd><CornerDownLeft class="h-3 w-3" /></Kbd>
				{$LL.searchOpen()}
			</span>
			<span class="flex items-center gap-1"><Kbd>esc</Kbd>{$LL.searchClose()}</span>
		</div>
	</div>
</Modal>
