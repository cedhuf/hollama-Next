<script lang="ts">
	import {
		ArrowRight,
		ArrowUp,
		Code,
		GraduationCap,
		Image as ImageIcon,
		Lightbulb,
		MessageSquareText,
		PenLine,
		X
	} from '@lucide/svelte';

	import LL from '$i18n/i18n-svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { chatDefaultsConfig } from '$lib/chatDefaults';
	import { buildChatTools, toolLabels } from '$lib/chatTools';
	import Head from '$lib/components/Head.svelte';
	import ImageViewer from '$lib/components/ImageViewer.svelte';
	import MobileMenuBar from '$lib/components/MobileMenuBar.svelte';
	import ModelSelect from '$lib/components/ModelSelect.svelte';
	import PersonaAvatar from '$lib/components/PersonaAvatar.svelte';
	import Tooltip from '$lib/components/Tooltip.svelte';
	import { supportsReasoningToggle } from '$lib/connections';
	import type { GeneratedImage } from '$lib/generatedImages';
	import { canDrawImages, imagesStore, imageUrl } from '$lib/images';
	import { personasStore, serversStore, sessionsStore, settingsStore } from '$lib/localStorage';
	import { mcpConfig } from '$lib/mcpConfig';
	import { conversedPersonas, launchPersona, type Persona } from '$lib/personas';
	import type { Attachment } from '$lib/promptAttachments';
	import { searchConfig } from '$lib/search';
	import { resolveSessionTitle } from '$lib/sessions';
	import { pendingMessage } from '$lib/stores/pendingMessage';
	import { generateRandomId } from '$lib/utils';
	import { webFetchConfig } from '$lib/webFetch';

	import PromptAttachments from './[id]/PromptAttachments.svelte';

	const searchAvailable = $derived($searchConfig.available);

	let prompt = $state('');
	let selectedModel = $state($chatDefaultsConfig.defaultModel.value || undefined);
	let webSearch = $state($searchConfig.available && $settingsStore.webSearchByDefault);
	let webFetch = $state($webFetchConfig.available && $settingsStore.webFetchByDefault);
	let interactiveChoices = $state($settingsStore.interactiveChoices);
	let mcp = $state(true);
	let sendCurrentDate = $state($settingsStore.sendCurrentDate);
	let thinking = $state(true);
	let attachments = $state<Attachment[]>([]);
	let openCategory = $state<string | null>(null);
	/**
	 * The category the panel is drawn from, which lags `openCategory` by one close.
	 *
	 * The panel folds shut on a transition, and a transition needs something left to
	 * animate: unmounting its contents the moment the category is cleared would make
	 * it vanish rather than close. So this keeps the last one, and is never cleared.
	 */
	let shownCategory = $state<string | null>(null);
	$effect(() => {
		if (openCategory) shownCategory = openCategory;
	});

	// Reasoning is only offered for backends that actually support it (Ollama's
	// native `think`, or OpenAI-compatible/Infomaniak `enable_thinking`).
	const supportsReasoning = $derived.by(() => {
		const model = $settingsStore.models.find((m) => m.name === selectedModel);
		const ct = model && $serversStore.find((s) => s.id === model.serverId)?.connectionType;
		return ct !== undefined && supportsReasoningToggle(ct);
	});

	const tools = $derived(
		buildChatTools(
			{ webSearch, webFetch, interactiveChoices, sendCurrentDate, thinking, mcp },
			(key, value) => {
				if (key === 'webSearch') webSearch = value;
				else if (key === 'webFetch') webFetch = value;
				else if (key === 'interactiveChoices') interactiveChoices = value;
				else if (key === 'sendCurrentDate') sendCurrentDate = value;
				else if (key === 'mcp') mcp = value;
				else thinking = value;
			},
			{
				webSearch: searchAvailable,
				webFetch: $webFetchConfig.available,
				reasoning: supportsReasoning,
				mcp: $mcpConfig.hasServers
			},
			toolLabels($LL)
		)
	);

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

	const shownSuggestions = $derived(
		shownCategory ? suggestionsByCategory[shownCategory] || [] : []
	);

	/**
	 * All of them, newest first.
	 *
	 * The strip used to stop at a number set by a slider, which meant the row was
	 * a sample of the gallery rather than the gallery. It scrolls sideways and
	 * every thumbnail loads lazily, so the count costs a row of `<img>` tags that
	 * fetch nothing until they are scrolled into view.
	 */
	const recentImages = $derived($imagesStore);

	/** The picture the strip has open, in the viewer the gallery uses. */
	let openedImage = $state<GeneratedImage | null>(null);

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
			webFetch,
			interactiveChoices,
			sendCurrentDate,
			thinking,
			mcp,
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

	/** Awaited, so the conversation exists before the page that reads it opens. */
	async function launch(persona: Persona) {
		const id = await launchPersona(persona, $settingsStore.models);
		goto(resolve('/sessions/[id]', { id }));
	}
</script>

<Head title={$LL.sessions()} />

<div class="flex h-full flex-col">
	<div class="flex min-h-0 flex-1 flex-col overflow-auto">
		<MobileMenuBar />
		<div class="my-auto flex w-full max-w-2xl flex-col items-center self-center px-6 py-12">
			{#if $settingsStore.homeShowHeader}
				<div class="mb-8 text-center">
					<h1 class="text-active text-2xl font-semibold tracking-tight">
						{greeting}
					</h1>
					<p class="text-muted mt-1.5">{$LL.howCanIHelp()}</p>
				</div>
			{/if}

			<div class="mb-8 w-full">
				<div class="mb-3 flex items-center justify-center">
					<ModelSelect bind:value={selectedModel} variant="hero" />
				</div>
				<div
					class="border-shade-3 bg-shade-0 hover:border-shade-4 focus-within:border-shade-5 rounded-2xl border shadow-sm transition-all focus-within:shadow-md"
				>
					<textarea
						placeholder={$LL.howCanIHelp()}
						class="w-full resize-none bg-transparent px-5 pt-4 pb-1 text-base text-sm outline-none"
						style="field-sizing: content; min-height: 56px; max-height: 200px;"
						bind:value={prompt}
						onkeydown={handleKeyDown}
						enterkeyhint="send"
						inputmode="text"></textarea>
					<PromptAttachments bind:attachments {tools}>
						{#snippet actions()}
							<button
								onclick={() => submit(prompt)}
								disabled={!prompt.trim() && !attachments.length}
								class="bg-accent text-shade-0 flex h-8 w-8 items-center justify-center rounded-lg transition-opacity disabled:opacity-30"
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

					<!-- Folds on grid rows rather than on a height, so nothing has to be
					     measured and the panel opens from whatever its content happens to be.
					     The margin rides the same transition, otherwise the gap above it would
					     appear on a frame while the panel was still opening. -->
					<div
						class="grid transition-[grid-template-rows,opacity,margin] duration-200 ease-out motion-reduce:transition-none {openCategory
							? 'mt-3 grid-rows-[1fr] opacity-100'
							: 'mt-0 grid-rows-[0fr] opacity-0'}"
					>
						<div class="min-h-0 overflow-hidden">
							{#if shownCategory && shownSuggestions.length > 0}
								{@const currentCategory = categories.find((c) => c.id === shownCategory)}
								<div class="border-shade-3 bg-shade-0 overflow-hidden rounded-xl border">
									<div class="border-shade-3 flex items-center gap-2 border-b px-3 py-2">
										{#if currentCategory}
											<currentCategory.icon class="text-muted h-3.5 w-3.5" />
										{/if}
										<span class="text-muted flex-1 text-xs font-medium">{shownCategory}</span>
										<button
											type="button"
											onclick={() => (openCategory = null)}
											class="text-muted hover:text-active transition-colors"
											aria-label="Close suggestions"
										>
											<X class="h-3.5 w-3.5" />
										</button>
									</div>
									<div class="divide-shade-3 divide-y">
										{#each shownSuggestions as suggestion (suggestion)}
											<button
												type="button"
												onclick={() => submit(suggestion)}
												class="group hover:bg-shade-1 flex w-full items-center gap-2 px-4 py-2.5 text-left text-base text-sm transition-colors"
											>
												<span class="flex-1">{suggestion}</span>
												<ArrowRight
													class="text-muted h-3.5 w-3.5 flex-shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
												/>
											</button>
										{/each}
									</div>
								</div>
							{/if}
						</div>
					</div>
				</div>
			{/if}

			{#if recentPersonas.length > 0}
				<div class="mt-10 flex w-full justify-center gap-4">
					{#each recentPersonas as persona (persona.id)}
						<button
							type="button"
							onclick={() => launch(persona)}
							class="transition-transform hover:scale-105"
							title={`${persona.name}: ${persona.tagline}`}
						>
							<PersonaAvatar {persona} size={48} />
						</button>
					{/each}
				</div>
			{/if}

			<!-- The latest pictures, after the personas and before the conversations.

			     A strip rather than a grid: this is a glance at what you last made and a
			     way back to the page that makes more, not a gallery. Thumbnails are small
			     on purpose, and the row scrolls sideways instead of wrapping, so the
			     section keeps one height whatever it holds.

			     Shown even with nothing in it, unlike the sections around it, because an
			     empty gallery is the one state where a way in is worth the most. -->
			{#if $settingsStore.homeShowRecentImages && $canDrawImages}
				<div class="mt-10 w-full">
					<h2 class="text-muted mb-3 text-xs font-semibold tracking-wider uppercase">
						{$LL.recentImages()}
					</h2>

					{#if recentImages.length > 0}
						<!-- The button floats over the strip rather than taking a column beside
						     it. Reserving 36 pixels for it left a block of plain background
						     interrupting the row, which read as a hole in the pictures rather
						     than as a control's neighbourhood. -->
						<div class="relative flex items-center">
							<!-- `min-w-0` so the strip can be narrower than its content, which is
							     what lets it scroll rather than push the button off the row.

							     Quiet rather than the app's usual scroller: a styled bar never fades
							     out, and under a row of 64px thumbnails it is a grey line drawn
							     permanently across the section. A thumbnail cut off at the edge
							     already says there is more to the right. -->
							<!-- The last stretch dissolves instead of stopping at an edge, which
							     gives the button something quiet to sit on and says the row goes on.
							     A mask rather than a gradient in the page's colour: it fades to
							     nothing, so it is right over a wallpaper as well as over a plain
							     background. -->
							<div
								class="overflow-quiet min-w-0 flex-1 overflow-y-hidden [mask-image:linear-gradient(to_right,black_calc(100%-4.5rem),transparent)] [-webkit-mask-image:linear-gradient(to_right,black_calc(100%-4.5rem),transparent)]"
							>
								<!-- Room at the end so the last thumbnail can be scrolled clear of
								     the button instead of stopping under it. -->
								<div class="flex w-max gap-2 pr-16">
									{#each recentImages as image (image.id)}
										<!-- The app's own tooltip rather than the browser's: a strip of
										     thumbnails is unreadable without one, and a `title` attribute
										     waits a second, cannot be reached by keyboard, and is drawn by
										     the operating system instead of by the app. -->
										<Tooltip side="bottom">
											{#snippet trigger({ props })}
												<!-- Opens the picture here, over the home page. Sending people to
												     the gallery to see what they had already clicked would make the
												     button at the end of the strip pointless, and that button is the
												     way to the page. -->
												<button
													{...props}
													type="button"
													onclick={() => (openedImage = image)}
													class="group border-shade-3 bg-shade-0 relative block h-16 w-16 shrink-0 overflow-hidden rounded-lg border"
												>
													<img
														src={imageUrl(image.id)}
														alt={image.prompt}
														loading="lazy"
														class="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105 motion-reduce:transition-none motion-reduce:group-hover:scale-100"
													/>
												</button>
											{/snippet}
											{image.title || image.sentPrompt || image.prompt}
										</Tooltip>
									{/each}
								</div>
							</div>

							<!-- The way to the page, at the end of the strip: you arrive at it
							     having looked along what is already there.

							     Round and small, not a bordered 64px square. Matching the thumbnails
							     made it read as one more tile, an empty one, which is the wrong thing
							     for the only control in the row. A disc the size of the app's other
							     round controls reads as a control, and being shorter than the strip it
							     centres against it instead of squaring up to it. -->
							<a
								href={resolve('/images')}
								title={$LL.images()}
								aria-label={$LL.images()}
								class="border-shade-3 text-muted hover:border-accent hover:text-accent absolute top-1/2 right-0 flex h-9 w-9 shrink-0 -translate-y-1/2 items-center justify-center rounded-full border bg-transparent backdrop-blur-sm transition-colors"
							>
								<ArrowRight class="h-4 w-4" />
							</a>
						</div>
					{:else}
						<a
							href={resolve('/images')}
							class="border-shade-4 hover:border-shade-6 flex flex-col items-center gap-1.5 rounded-xl border border-dashed px-6 py-6 text-center transition-colors"
						>
							<ImageIcon class="text-muted h-5 w-5" />
							<span class="text-muted text-sm">{$LL.imagesEmpty()}</span>
							<span class="text-link text-sm font-medium">{$LL.imagesStartGenerating()}</span>
						</a>
					{/if}
				</div>
			{/if}

			{#if $settingsStore.homeShowRecentSessions && recentSessions.length > 0}
				<div class="mt-10 w-full">
					<h2 class="text-muted mb-3 text-xs font-semibold tracking-wider uppercase">
						{$LL.recentSessions()}
					</h2>
					<div class="divide-shade-3 border-shade-3 bg-shade-0 divide-y rounded-xl border">
						{#each recentSessions as session (session.id)}
							<a
								href={resolve('/sessions/[id]', { id: session.id })}
								class="hover:bg-shade-1 flex items-center gap-3 px-4 py-3 text-base text-sm transition-colors first:rounded-t-xl last:rounded-b-xl"
							>
								<MessageSquareText class="text-muted h-4 w-4 flex-shrink-0" />
								<span class="flex-1 truncate"
									>{resolveSessionTitle(session) || $LL.newSession()}</span
								>
								<span class="text-muted flex-shrink-0 text-xs">
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

<!-- The gallery's own viewer, opened from the strip above. -->
<ImageViewer bind:image={openedImage} />
