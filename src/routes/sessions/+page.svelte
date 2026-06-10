<script lang="ts">
	import { goto } from '$app/navigation';
	import { ArrowRight, ArrowUp, MessageSquareText, Sparkles } from 'lucide-svelte';

	import LL from '$i18n/i18n-svelte';
	import FieldSelectModel from '$lib/components/FieldSelectModel.svelte';
	import Head from '$lib/components/Head.svelte';
	import { sessionsStore, settingsStore } from '$lib/localStorage';
	import { getSessionTitle } from '$lib/sessions';
	import { generateRandomId } from '$lib/utils';

	let prompt = $state('');
	let selectedModel = $state($settingsStore.defaultModel || undefined);

	const greeting = $derived.by(() => {
		const hour = new Date().getHours();
		if (hour < 12) return 'Good morning';
		if (hour < 18) return 'Good afternoon';
		return 'Good evening';
	});

	const suggestions = [
		'Write a professional email to my team about our upcoming project deadline',
		'Explain machine learning in simple terms with a real-world example',
		'Help me write a SQL query to analyze monthly sales trends',
		'Create a balanced weekly workout plan for beginners',
		'Draft a social media post for a new product launch',
		'Help me debug: my React component is not re-rendering after state change'
	];

	const recentSessions = $derived(($sessionsStore ?? []).slice(0, 5));

	function submit(text: string) {
		if (!text.trim()) return;
		const id = generateRandomId();
		const params = new URLSearchParams();
		params.set('q', text.trim());
		if (selectedModel) params.set('model', selectedModel);
		goto(`/sessions/${id}?${params.toString()}`);
	}

	function handleSuggestion(text: string) {
		submit(text);
	}

	function handleKeyDown(event: KeyboardEvent) {
		if (event.shiftKey) return;
		if (event.key !== 'Enter') return;
		event.preventDefault();
		submit(prompt);
	}
</script>

<Head title={$LL.sessions()} />

<div class="flex h-full flex-col">
	<div class="flex min-h-0 flex-1 flex-col overflow-auto">
		<div class="my-auto flex w-full max-w-2xl flex-col items-center self-center px-6 py-12">
			<div class="mb-10 text-center">
				<img
					src="/favicon.png"
					alt="Hollama Next"
					class="mx-auto mb-6 h-12 w-12"
				/>
				<h1 class="text-2xl font-semibold tracking-tight text-active">
					{greeting}
				</h1>
				<p class="mt-1.5 text-muted">How can I help you today?</p>
			</div>

			<div class="mb-10 w-full">
				<div
					class="rounded-2xl border border-shade-3 bg-shade-0 shadow-sm transition-all hover:border-shade-4 focus-within:border-shade-5 focus-within:shadow-md"
				>
					<textarea
						placeholder="How can I help you today?"
						class="w-full resize-none bg-transparent px-5 pb-1 pt-4 text-sm text-base outline-none"
						style="field-sizing: content; min-height: 56px; max-height: 200px;"
						bind:value={prompt}
						onkeydown={handleKeyDown}
					></textarea>
					<div class="flex items-center justify-between px-4 pb-3 pt-1">
						<div class="max-w-[200px]">
							<FieldSelectModel isLabelVisible={false} bind:value={selectedModel} />
						</div>
						<button
							onclick={() => submit(prompt)}
							disabled={!prompt.trim()}
							class="flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-neutral-50 transition-opacity disabled:opacity-30"
						>
							<ArrowUp class="h-4 w-4" />
						</button>
					</div>
				</div>
			</div>

			<div class="grid w-full grid-cols-1 gap-3 sm:grid-cols-2">
				{#each suggestions as suggestion}
					<button
						onclick={() => handleSuggestion(suggestion)}
						class="group flex items-start gap-3 rounded-xl border border-shade-3 bg-shade-0 p-4 text-left text-sm text-base transition-all hover:border-shade-5 hover:shadow-sm"
					>
						<Sparkles class="mt-0.5 h-4 w-4 flex-shrink-0 text-muted" />
						<span class="flex-1 leading-snug">{suggestion}</span>
						<ArrowRight class="mt-0.5 h-4 w-4 flex-shrink-0 text-muted opacity-0 transition-opacity group-hover:opacity-100" />
					</button>
				{/each}
			</div>

			{#if recentSessions.length > 0}
				<div class="mt-12 w-full">
					<h2 class="mb-3 text-xs font-semibold uppercase tracking-wider text-muted">
						Recent sessions
					</h2>
					<div class="divide-y divide-shade-3 rounded-xl border border-shade-3 bg-shade-0">
						{#each recentSessions as session}
							<a
								href={`/sessions/${session.id}`}
								class="flex items-center gap-3 px-4 py-3 text-sm text-base transition-colors hover:bg-shade-1 first:rounded-t-xl last:rounded-b-xl"
							>
								<MessageSquareText class="h-4 w-4 flex-shrink-0 text-muted" />
								<span class="flex-1 truncate">{getSessionTitle(session) || 'New session'}</span>
								<span class="flex-shrink-0 text-xs text-muted">
									{session.updatedAt
										? new Date(session.updatedAt).toLocaleDateString(undefined, {
												month: 'short',
												day: 'numeric'
											})
										: ''}
								</span>
							</a>
						{/each}
					</div>
				</div>
			{/if}
		</div>
	</div>
</div>
