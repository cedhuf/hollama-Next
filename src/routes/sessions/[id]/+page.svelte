<script lang="ts">
	import { ArrowDown, MoreHorizontal, Settings2 } from '@lucide/svelte';
	import { onMount, tick, untrack } from 'svelte';
	import { fly } from 'svelte/transition';

	import LL from '$i18n/i18n-svelte';
	import { beforeNavigate, goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { Conversation, type QueryEntry } from '$lib/chat/conversation.svelte';
	import Button from '$lib/components/Button.svelte';
	import ButtonConfirm from '$lib/components/ButtonConfirm.svelte';
	import Head from '$lib/components/Head.svelte';
	import Header from '$lib/components/Header.svelte';
	import Menu from '$lib/components/Menu.svelte';
	import ModelSelect from '$lib/components/ModelSelect.svelte';
	import PersonaAvatar from '$lib/components/PersonaAvatar.svelte';
	import RefusalDialog from '$lib/components/RefusalDialog.svelte';
	import SessionMenu from '$lib/components/SessionMenu.svelte';
	import { personasStore, sessionsStore, settingsStore } from '$lib/localStorage';
	import { unbindPersonaSession } from '$lib/personas';
	import { resolveSessionTitle } from '$lib/sessions';
	import { pendingMessage } from '$lib/stores/pendingMessage';
	import { formatTimestampToNow, isTouchPrimary } from '$lib/utils';

	import type { PageData } from './$types';
	import ButtonCopyConversation from './ButtonCopyConversation.svelte';
	import Messages from './Messages.svelte';
	import Prompt from './Prompt.svelte';
	import SessionModal from './SessionModal.svelte';

	interface Props {
		data: PageData;
	}

	let { data }: Props = $props();

	/**
	 * The conversation itself, which is not this page: sending a turn, following
	 * it, picking it back up after a reload all live in there. What is left here is
	 * the screen, and all the conversation asks of it is where the bottom is.
	 */
	// svelte-ignore state_referenced_locally
	const chat = new Conversation(data.session, {
		scrollToBottom: (force, smooth) => scrollToBottom(force, smooth)
	});

	let messagesWindow: HTMLDivElement | undefined = $state();
	let userScrolledUp = $state(false);
	let shouldConfirmDeletion = $state(false);

	/** What the delete button on this page does, now that the button itself does not. */
	function deleteSession() {
		sessionsStore.remove(chat.session.id);
		unbindPersonaSession(chat.session.id);
		void goto(resolve('/sessions'));
	}
	let sessionModalOpen = $state(false);

	/** Sticky at the foot of the conversation while you read it, in the column's footer once the editor takes the screen. */
	const floatingComposer = $derived(!chat.editor.isExpanded);

	/** Reading a conversation is the only view where either has something to float over. */
	const floatingHeader = $derived($settingsStore.floatingChatHeader !== false && floatingComposer);

	// The composer floats over the message list, so the scroll area reserves matching
	// bottom space for the last message to clear it.

	// The persona this conversation belongs to, if any (drives the header identity).
	const persona = $derived(
		chat.session.personaId ? $personasStore.find((p) => p.id === chat.session.personaId) : undefined
	);

	// Empty until there is a real title or a first user message: the header falls
	// back to "Session #id" until then.
	const sessionTitle = $derived(chat.editor.isNewSession ? '' : resolveSessionTitle(chat.session));

	$effect(() => {
		if (data.id !== chat.session.id) openConversation();
	});

	$effect(() => chat.syncModel());

	// Watched here rather than inside the conversation, which holds no effects.
	$effect(() => {
		void chat.editor.prompt;
		untrack(() => chat.rememberDraft());
	});

	// Re-resolve the system prompt when the model changes (new/unedited sessions).
	$effect(() => {
		void chat.modelName;
		untrack(() => chat.autoResolveSystemPrompt());
	});

	// Taking focus back once an answer lands is a convenience with a mouse and a
	// nuisance with a thumb, where it reopens the keyboard over the unread reply.
	// The request is consumed either way, so it does not fire later.
	$effect(() => {
		if (chat.editor.shouldFocusTextarea && chat.editor.promptTextarea) {
			if (!isTouchPrimary()) chat.editor.promptTextarea.focus();
			chat.editor.shouldFocusTextarea = false;
		}
	});

	/** Arriving from a search result: `?m=<index>` names the passage chosen, so land on it rather than at the bottom. */
	const searchMatchIndex = $derived.by(() => {
		const raw = page.url.searchParams.get('m');
		if (raw === null) return null;
		const index = Number(raw);
		return Number.isInteger(index) && index >= 0 ? index : null;
	});

	/** Watched rather than run on mount: opening a result is a client-side navigation, so the component is reused and `onMount` never fires again. */
	$effect(() => {
		const index = searchMatchIndex;
		if (index === null) return;
		void highlightMessage(index);
	});

	/** The message may not be in the DOM yet, so wait for it rather than give up on the first miss. */
	async function highlightMessage(index: number): Promise<void> {
		await tick();

		let target: HTMLElement | null = null;
		for (let attempt = 0; attempt < 20 && !target; attempt++) {
			target = document.getElementById(`message-${index}`);
			if (!target) await new Promise((resolve) => requestAnimationFrame(resolve));
		}
		if (!target) return;

		target.scrollIntoView({ block: 'center' });

		// Restart the animation even for the same message twice: removing the class is
		// not enough on its own, the reflow in between is what makes it a new animation.
		target.classList.remove('message--found');
		void target.offsetWidth;
		target.classList.add('message--found');
		setTimeout(() => target?.classList.remove('message--found'), 2000);
	}

	onMount(() => {
		openConversation();
	});

	/**
	 * Both ways in are the router's business: a message composed on the home page
	 * travels in a store, a prompt named in the address travels in the URL. Read
	 * here, taken out of where they were so a refresh does not send them twice.
	 */
	function openConversation() {
		const pending = $pendingMessage;
		if (pending) pendingMessage.set(null);

		let query: QueryEntry | null = null;
		const promptParam = pending ? null : page.url.searchParams.get('q');
		if (promptParam) {
			query = {
				prompt: promptParam,
				model: page.url.searchParams.get('model') ?? undefined,
				search: page.url.searchParams.get('search') === '1'
			};

			// Strip the one-shot params, so a refresh does not re-submit the prompt.
			const cleaned = new URL(page.url);
			cleaned.searchParams.delete('q');
			cleaned.searchParams.delete('model');
			cleaned.searchParams.delete('search');
			history.replaceState(history.state, '', cleaned);
		}

		void chat.open(data.session, { pending, query, atBottom: searchMatchIndex === null });
	}

	beforeNavigate(() => {
		// Leaving never abandons a turn: it runs in the server, is written down as it
		// goes, and is waiting when the conversation is reopened. So leaving only
		// stops watching, and what is in the composer is saved on every keystroke.
		chat.detach();
	});

	/** "Near enough to the bottom" needs slack: an exact comparison flips on a single pixel of sub-pixel rounding, which happens constantly while content grows. */
	const SCROLL_BOTTOM_THRESHOLD = 32;

	/**
	 * Where the conversation is, read from the box. The only thing that ever puts
	 * auto-follow back on, and deliberately not the only thing that turns it off:
	 * geometry cannot tell a scroll you made from one the page made, and during a
	 * generation the page makes one every frame.
	 */
	function handleScroll() {
		if (!messagesWindow) return;
		const { scrollTop, scrollHeight, clientHeight } = messagesWindow;
		userScrolledUp = scrollTop + clientHeight < scrollHeight - SCROLL_BOTTOM_THRESHOLD;
	}

	/**
	 * Reading upwards stops the follow at once, from the gesture rather than from
	 * where it lands. A flick of the wheel takes a moment to travel more than the
	 * slack above, and the next token landed inside that moment and killed the
	 * momentum. A wheel event fires before the scroll it causes, so the frame that
	 * would have yanked you back reads this and does nothing.
	 */
	function detachOnIntent() {
		userScrolledUp = true;
	}

	function handleWheel(event: WheelEvent) {
		if (event.deltaY < 0) detachOnIntent();
	}

	/** The same, for a finger: dragging downwards is reading upwards. */
	let touchStartY = 0;
	function handleTouchStart(event: TouchEvent) {
		touchStartY = event.touches[0]?.clientY ?? 0;
	}
	function handleTouchMove(event: TouchEvent) {
		const y = event.touches[0]?.clientY ?? 0;
		if (y > touchStartY + 4) detachOnIntent();
	}

	/**
	 * Bound to the box, and rebound whenever there is a different box.
	 *
	 * As one `addEventListener` in `onMount` this broke: the scroller lives in the
	 * `else` of the view switch, so opening the controls destroyed it and coming
	 * back built a new one with nothing listening. Passive throughout: none of these
	 * cancels a gesture, they only read it.
	 */
	$effect(() => {
		const box = messagesWindow;
		if (!box) return;

		const passive = { passive: true } as const;
		box.addEventListener('scroll', handleScroll, passive);
		box.addEventListener('wheel', handleWheel, passive);
		box.addEventListener('touchstart', handleTouchStart, passive);
		box.addEventListener('touchmove', handleTouchMove, passive);

		return () => {
			box.removeEventListener('scroll', handleScroll);
			box.removeEventListener('wheel', handleWheel);
			box.removeEventListener('touchstart', handleTouchStart);
			box.removeEventListener('touchmove', handleTouchMove);
		};
	});

	/** One frame may hold at most one queued auto-follow, however many tokens land. */
	let scrollQueued = false;

	/** `smooth` is for the deliberate jump back: the animation shows how far you travelled. Auto-follow stays instant, or a scroll retriggering on every token would never settle. */
	async function scrollToBottom(shouldForceScroll = false, smooth = false) {
		if (!shouldForceScroll && (!messagesWindow || userScrolledUp)) return;
		// Streaming calls this on every chunk, and without coalescing each queued its
		// own frame faster than they could run.
		if (!shouldForceScroll) {
			if (scrollQueued) return;
			scrollQueued = true;
		}
		await tick();
		requestAnimationFrame(() => {
			if (!shouldForceScroll) scrollQueued = false;
			if (!messagesWindow) return;
			// Re-checked here, not only on the way in: the user may have started scrolling
			// between the call and this frame, and yanking them back also cleared
			// `userScrolledUp`, so the page fought every attempt to read further up.
			if (!shouldForceScroll && userScrolledUp) return;
			messagesWindow.scrollTo({
				top: messagesWindow.scrollHeight,
				behavior: smooth ? 'smooth' : 'auto'
			});
		});
	}
</script>

{#snippet topBar(floating: boolean)}
	<Header {floating}>
		{#snippet headline()}
			{#if persona}
				<!-- Persona identity, laid out like the title/meta pair: avatar, name, tagline. -->
				<div class="flex min-w-0 items-center gap-2.5" title={persona.tagline}>
					<PersonaAvatar {persona} size={32} />
					<div class="flex min-w-0 flex-col gap-0.5">
						<p class="text-active truncate text-sm leading-tight font-bold">{persona.name}</p>
						{#if persona.tagline}
							<p class="text-muted truncate text-xs leading-tight">{persona.tagline}</p>
						{/if}
					</div>
				</div>
			{:else}
				<!-- Once there is a title it becomes the headline, with the id as a
				     parenthesised link so it stays copyable. -->
				<!-- leading-tight, not leading-none: `truncate` hides overflow, so a line box
				     the exact height of the font clips descenders. -->
				<p data-testid="session-id" class="truncate leading-tight font-bold">
					{#if sessionTitle}
						{sessionTitle}
						<span class="text-muted">
							(<Button variant="link" href={`/sessions/${chat.session.id}`}
								>#{chat.session.id}</Button
							>)
						</span>
					{:else}
						{$LL.session()}
						<Button variant="link" href={`/sessions/${chat.session.id}`}>#{chat.session.id}</Button>
					{/if}
				</p>
				<div class="text-muted flex items-center gap-1.5 text-xs">
					{chat.editor.isNewSession
						? $LL.newSession()
						: formatTimestampToNow(chat.session.updatedAt ?? '')}
				</div>
			{/if}
		{/snippet}

		{#snippet nav()}
			{#if !persona}
				<!-- Model and settings as one control: the model is this conversation's
				     configuration, so it sits with the button that opens it, and the title keeps
				     its full height. On mobile only the settings half shows. The border is on
				     the group, so focusing the picker rings the whole control. -->
				<div
					class="border-shade-3 focus-within:border-accent has-[[data-state=open]]:border-accent mr-1 flex items-center overflow-hidden rounded-md border transition-colors"
				>
					<span class="hidden lg:flex">
						<ModelSelect bind:value={chat.modelName} variant="attached" />
					</span>
					<!-- Transparent on the header's background: chrome, not content. -->
					<button
						type="button"
						class="text-muted hover:bg-shade-2 hover:text-active flex h-8 items-center justify-center bg-transparent px-2 transition-colors"
						onclick={() => (sessionModalOpen = true)}
						title={$LL.session()}
						aria-label={$LL.session()}
					>
						<Settings2 class="base-icon" />
					</button>
				</div>
			{/if}
			{#if !chat.editor.isNewSession}
				<!-- Nothing moves while the question stands: the button says so itself, so the
				     bar no longer turns red and its neighbour no longer disappears. -->
				<ButtonCopyConversation session={chat.session} assistantLabel={persona?.name} />
				<ButtonConfirm
					bind:armed={shouldConfirmDeletion}
					onConfirm={deleteSession}
					label={$LL.deleteSession()}
				/>
			{/if}
		{/snippet}

		<!-- The phone's two buttons. Deleting takes the pill over while it waits: there
		     is nowhere else to ask. -->
		{#snippet compact()}
			{#if shouldConfirmDeletion}
				<ButtonConfirm
					bind:armed={shouldConfirmDeletion}
					onConfirm={deleteSession}
					label={$LL.deleteSession()}
				/>
			{:else}
				<button
					type="button"
					class="text-muted hover:bg-shade-2 hover:text-active flex h-9 w-9 items-center justify-center rounded-full transition-colors"
					onclick={() => (sessionModalOpen = true)}
					aria-label={$LL.session()}
				>
					<Settings2 class="h-5 w-5" />
				</button>

				<Menu class="w-64" align="start">
					{#snippet trigger({ props })}
						<button
							{...props}
							type="button"
							class="text-muted hover:bg-shade-2 hover:text-active flex h-9 w-9 items-center justify-center rounded-full transition-colors"
							aria-label={$LL.moreOptions()}
						>
							<MoreHorizontal class="h-5 w-5" />
						</button>
					{/snippet}

					<!-- The title has room here: two lines, fixed, cut with an ellipsis, so the menu
					     never changes height with the conversation. -->
					<p class="text-muted line-clamp-2 px-2 py-1.5 text-xs leading-snug">
						{chat.editor.isNewSession ? $LL.newSession() : resolveSessionTitle(chat.session)}
					</p>
					<div class="bg-shade-3 my-1 h-px" role="none"></div>

					{#if !chat.editor.isNewSession}
						<SessionMenu
							id={chat.session.id}
							pinned={chat.session.pinned}
							onDelete={() => (shouldConfirmDeletion = true)}
						/>
					{/if}
				</Menu>
			{/if}
		{/snippet}
	</Header>
{/snippet}

{#snippet composer()}
	<Prompt
		bind:session={chat.session}
		bind:editor={chat.editor}
		handleSubmit={chat.submit}
		stopCompletion={chat.stop}
		{scrollToBottom}
		pendingChoice={chat.pendingChoice}
		chooseAnswer={chat.answerChoice}
		runCommand={chat.runCommand}
		canCompact={chat.canCompact}
		canClear={chat.canClear}
		contextThreshold={chat.compactConfig.compactThreshold}
	/>
{/snippet}

<div class="session relative flex h-full w-full flex-col overflow-hidden">
	<Head
		title={[
			chat.editor.isNewSession ? $LL.newSession() : resolveSessionTitle(chat.session),
			$LL.sessions()
		]}
	/>
	{#if !floatingHeader}
		{@render topBar(false)}
	{/if}

	<!-- The transcript and the button returning to its foot, in one box, so the
	     button anchors to the conversation rather than to the column and needs no
	     telling how tall the composer is.

	     Its scrollbar gutter is reserved whether or not there is a scrollbar: the
	     two floating bars live inside this box, and would otherwise shift sideways
	     the moment a reply made the page overflow. -->
	<div class="relative flex min-h-0 flex-grow flex-col">
		<div
			class="session__history surface-pane flex flex-grow flex-col overflow-auto px-4 lg:px-6 xl:px-8"
			style="scrollbar-gutter: stable"
			bind:this={messagesWindow}
		>
			{#if floatingHeader}
				<!-- The mirror of the composer below: sticky rather than laid on top, so it
				     reserves its own room and never covers the first message. -->
				<div class="sticky top-0 z-20 -mx-4 lg:-mx-6 xl:-mx-8">
					{@render topBar(true)}
				</div>
			{/if}
			<!-- Grows to fill whatever the conversation does not, which puts the composer at
			     the foot of a short exchange rather than halfway up: a sticky element only
			     sticks once there is something to scroll. -->
			<div class="grow">
				<Messages
					bind:session={chat.session}
					bind:editor={chat.editor}
					handleRetry={chat.retry}
					chooseAnswer={chat.answerChoice}
					pendingChoice={chat.pendingChoice}
					onApproveTool={chat.approveTool}
					assistantLabel={persona?.name}
					isCompacting={chat.isCompacting}
					onCancelCompaction={chat.cancelCompaction}
					onAddMention={chat.addMention}
					onTogglePlaybook={chat.togglePlaybook}
				/>
			</div>

			{#if floatingComposer}
				<!-- Sticky rather than laid on top, which is the whole difference: it stays in
				     the flow, reserves its own room and never covers the last message. The
				     negative margins undo the transcript's side gutter; there is no vertical one
				     left, because a stuck element anchors inside the scrollport. -->
				<div class="sticky bottom-0 z-10 -mx-4 lg:-mx-6 xl:-mx-8">
					<!-- Scrolling up during a reply opts you out of auto-follow, and without this
					     nothing says content is still arriving below. Carried by the composer, so it
					     stands above it without anyone knowing how tall it is. -->
					{#if userScrolledUp}
						<button
							type="button"
							transition:fly={{ y: 8, duration: 150 }}
							onclick={() => scrollToBottom(true, true)}
							aria-label={$LL.scrollToBottom()}
							title={$LL.scrollToBottom()}
							class="scroll-to-bottom border-shade-3 bg-shade-0 text-muted hover:text-active absolute -top-11 left-1/2 z-20 flex h-9 w-9 -translate-x-1/2 items-center justify-center rounded-full border shadow-md transition-colors"
						>
							<ArrowDown class="base-icon" />
						</button>
					{/if}
					{@render composer()}
				</div>
			{/if}
		</div>
	</div>

	<!-- Drawn in one of two places, never both. -->
	{#if !floatingComposer}
		<div class="surface-chrome shrink-0">
			{@render composer()}
		</div>
	{/if}
</div>

<SessionModal
	bind:open={sessionModalOpen}
	bind:session={chat.session}
	bind:modelName={chat.modelName}
/>
<RefusalDialog bind:open={chat.refusalOpen} detail={chat.refusalDetail} />
