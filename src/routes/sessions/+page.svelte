<script lang="ts">
	import {
		ArrowRight,
		ArrowUp,
		Code,
		GraduationCap,
		Lightbulb,
		MessageSquareText,
		PenLine,
		X
	} from '@lucide/svelte';

	import LL from '$i18n/i18n-svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { chatDefaultsConfig } from '$lib/chatDefaults';
	import Head from '$lib/components/Head.svelte';
	import MobileMenuBar from '$lib/components/MobileMenuBar.svelte';
	import ModelSelect from '$lib/components/ModelSelect.svelte';
	import PersonaAvatar from '$lib/components/PersonaAvatar.svelte';
	import { supportsReasoningToggle } from '$lib/connections';
	import { personasStore, serversStore, sessionsStore, settingsStore } from '$lib/localStorage';
	import { conversedPersonas, launchPersona } from '$lib/personas';
	import type { Attachment } from '$lib/promptAttachments';
	import { searchConfig } from '$lib/search';
	import { getSessionTitle } from '$lib/sessions';
	import { pendingMessage } from '$lib/stores/pendingMessage';
	import { generateRandomId } from '$lib/utils';

	import PromptAttachments from './[id]/PromptAttachments.svelte';

	const searchAvailable = $derived($searchConfig.available);

	let prompt = $state('');
	let selectedModel = $state($chatDefaultsConfig.defaultModel.value || undefined);
	let webSearch = $state($searchConfig.available && $settingsStore.webSearchByDefault);
	let interactiveChoices = $state($settingsStore.interactiveChoices);
	let sendCurrentDate = $state($settingsStore.sendCurrentDate);
	let thinking = $state(true);
	let attachments = $state<Attachment[]>([]);
	let openCategory = $state<string | null>(null);

	// Reasoning is only offered for backends that actually support it (Ollama's
	// native `think`, or OpenAI-compatible/Infomaniak `enable_thinking`).
	const supportsReasoning = $derived.by(() => {
		const model = $settingsStore.models.find((m) => m.name === selectedModel);
		const ct = model && $serversStore.find((s) => s.id === model.serverId)?.connectionType;
		return ct !== undefined && supportsReasoningToggle(ct);
	});

	// Mirror the session composer's lightning dropdown so the home page can pre-set
	// the same per-conversation switches; they ride along in `pendingMessage`.
	const tools = $derived([
		...(searchAvailable
			? [{ label: 'Web search', checked: webSearch, onChange: (v: boolean) => (webSearch = v) }]
			: []),
		{
			label: 'Interactive choices',
			checked: interactiveChoices,
			onChange: (v: boolean) => (interactiveChoices = v)
		},
		{
			label: 'Current date',
			checked: sendCurrentDate,
			onChange: (v: boolean) => (sendCurrentDate = v)
		},
		...(supportsReasoning
			? [{ label: 'Reasoning', checked: thinking, onChange: (v: boolean) => (thinking = v) }]
			: [])
	]);

	const greeting = $derived.by(() => {
		const hour = new Date().getHours();
		if (hour < 12) return $LL.goodMorning();
		if (hour < 18) return $LL.goodAfternoon();
		return $LL.goodEvening();
	});

	const categories = [
		{ id: 'code', label: 'Code', icon: Code },
		{ id: 'write', label: 'Write', icon: PenLine },
		{ id: 'learn', label: 'Learn', icon: GraduationCap },
		{ id: 'life', label: 'Life', icon: Lightbulb }
	];

	const suggestionsByCategory: Record<string, string[]> = {
		code: [
			'Help me debug a React component that is not re-rendering',
			'Write a SQL query to analyze monthly sales trends',
			'Generate API documentation from my endpoint descriptions',
			'Design feature flags for a multi-tenant SaaS app',
			'Create a Docker compose file for a microservices setup'
		],
		write: [
			'Draft a professional email about an upcoming project deadline',
			'Create a social media post for a new product launch',
			'Develop editorial guidelines for a tech blog',
			'Write interview questions for a senior developer role',
			'Draft a newsletter for my team'
		],
		learn: [
			'Explain machine learning in simple terms with a real-world example',
			'Design a personal learning roadmap for web development',
			'Help me prepare for a technical interview',
			'Design a game that teaches coding concepts through storytelling',
			'Find credible sources for my research on climate change'
		],
		life: [
			'Create a balanced weekly workout plan for beginners',
			'Help me build a personal development plan',
			'Suggest strategies for managing work-life balance',
			'Create a cleaning and organizing routine for my apartment',
			'Help me weigh the pros and cons of a big decision'
		]
	};

	const activeSuggestions = $derived(openCategory ? suggestionsByCategory[openCategory] || [] : []);

	const recentSessions = $derived(
		($sessionsStore ?? []).slice(0, $settingsStore.homeRecentSessionsCount)
	);
	const recentPersonas = $derived(
		$settingsStore.homeShowRecentPersonas
			? conversedPersonas($personasStore, $sessionsStore ?? []).slice(
					0,
					$settingsStore.homeRecentPersonasCount
				)
			: []
	);

	function toggleCategory(id: string) {
		openCategory = openCategory === id ? null : id;
	}

	function submit(text: string) {
		const content = text.trim();
		if (!content && !attachments.length) return;
		const id = generateRandomId();
		pendingMessage.set({
			prompt: content,
			model: selectedModel,
			webSearch,
			interactiveChoices,
			sendCurrentDate,
			thinking,
			attachments
		});
		goto(resolve('/sessions/[id]', { id }));
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
	<MobileMenuBar />
	<div class="flex min-h-0 flex-1 flex-col overflow-auto">
		<div class="my-auto flex w-full max-w-2xl flex-col items-center self-center px-6 py-12">
			{#if $settingsStore.homeShowHeader}
				<div class="mb-8 text-center">
					<h1 class="text-2xl font-semibold tracking-tight text-active">
						{greeting}
					</h1>
					<p class="mt-1.5 text-muted">{$LL.howCanIHelp()}</p>
				</div>
			{/if}

			<div class="mb-8 w-full">
				<div class="mb-3 flex items-center justify-center">
					<ModelSelect bind:value={selectedModel} variant="hero" />
				</div>
				<div
					class="rounded-2xl border border-shade-3 bg-shade-0 shadow-sm transition-all hover:border-shade-4 focus-within:border-shade-5 focus-within:shadow-md"
				>
					<textarea
						placeholder={$LL.howCanIHelp()}
						class="w-full resize-none bg-transparent px-5 pb-1 pt-4 text-sm text-base outline-none"
						style="field-sizing: content; min-height: 56px; max-height: 200px;"
						bind:value={prompt}
						onkeydown={handleKeyDown}
						enterkeyhint="send"
						inputmode="text"
					></textarea>
					<PromptAttachments bind:attachments {tools}>
						{#snippet actions()}
							<button
								onclick={() => submit(prompt)}
								disabled={!prompt.trim() && !attachments.length}
								class="flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-shade-0 transition-opacity disabled:opacity-30"
							>
								<ArrowUp class="h-4 w-4" />
							</button>
						{/snippet}
					</PromptAttachments>
				</div>
			</div>

			{#if $settingsStore.homeShowSuggestions}
				<div class="w-full">
					<div class="flex flex-wrap justify-center gap-2">
						{#each categories as category (category.id)}
							<button
								type="button"
								onclick={() => toggleCategory(category.id)}
								class="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm transition-colors {openCategory ===
								category.id
									? 'bg-accent/10 text-active font-medium'
									: 'text-muted hover:text-active hover:bg-shade-2'}"
							>
								<category.icon class="h-3.5 w-3.5" />
								{category.label}
							</button>
						{/each}
					</div>

					{#if openCategory && activeSuggestions.length > 0}
						{@const currentCategory = categories.find((c) => c.id === openCategory)}
						<div class="mt-3 rounded-xl border border-shade-3 bg-shade-0 overflow-hidden">
							<div class="flex items-center gap-2 px-3 py-2 border-b border-shade-3">
								{#if currentCategory}
									<currentCategory.icon class="h-3.5 w-3.5 text-muted" />
								{/if}
								<span class="text-xs font-medium text-muted flex-1">{openCategory}</span>
								<button
									type="button"
									onclick={() => (openCategory = null)}
									class="text-muted hover:text-active transition-colors"
									aria-label="Close suggestions"
								>
									<X class="h-3.5 w-3.5" />
								</button>
							</div>
							<div class="divide-y divide-shade-3">
								{#each activeSuggestions as suggestion (suggestion)}
									<button
										type="button"
										onclick={() => submit(suggestion)}
										class="group flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-base transition-colors hover:bg-shade-1"
									>
										<span class="flex-1">{suggestion}</span>
										<ArrowRight
											class="h-3.5 w-3.5 flex-shrink-0 text-muted opacity-0 transition-opacity group-hover:opacity-100"
										/>
									</button>
								{/each}
							</div>
						</div>
					{/if}
				</div>
			{/if}

			{#if recentPersonas.length > 0}
				<div class="mt-10 flex w-full justify-center gap-4">
					{#each recentPersonas as persona (persona.id)}
						<button
							type="button"
							onclick={() =>
								goto(
									resolve('/sessions/[id]', { id: launchPersona(persona, $settingsStore.models) })
								)}
							class="transition-transform hover:scale-105"
							title={`${persona.name} — ${persona.tagline}`}
						>
							<PersonaAvatar {persona} size={48} />
						</button>
					{/each}
				</div>
			{/if}

			{#if $settingsStore.homeShowRecentSessions && recentSessions.length > 0}
				<div class="mt-10 w-full">
					<h2 class="mb-3 text-xs font-semibold uppercase tracking-wider text-muted">
						{$LL.recentSessions()}
					</h2>
					<div class="divide-y divide-shade-3 rounded-xl border border-shade-3 bg-shade-0">
						{#each recentSessions as session (session.id)}
							<a
								href={resolve('/sessions/[id]', { id: session.id })}
								class="flex items-center gap-3 px-4 py-3 text-sm text-base transition-colors hover:bg-shade-1 first:rounded-t-xl last:rounded-b-xl"
							>
								<MessageSquareText class="h-4 w-4 flex-shrink-0 text-muted" />
								<span class="flex-1 truncate">{getSessionTitle(session) || $LL.newSession()}</span>
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
