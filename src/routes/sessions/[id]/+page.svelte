<script lang="ts">
	import { ArrowDown, MoreHorizontal, Settings2 } from '@lucide/svelte';
	import { onMount, tick, untrack } from 'svelte';
	import { fly } from 'svelte/transition';

	import LL from '$i18n/i18n-svelte';
	import { beforeNavigate } from '$app/navigation';
	import { page } from '$app/state';
	import { Conversation, type QueryEntry } from '$lib/chat/conversation.svelte';
	import Button from '$lib/components/Button.svelte';
	import ButtonDelete from '$lib/components/ButtonDelete.svelte';
	import Head from '$lib/components/Head.svelte';
	import Header from '$lib/components/Header.svelte';
	import Menu from '$lib/components/Menu.svelte';
	import ModelSelect from '$lib/components/ModelSelect.svelte';
	import PersonaAvatar from '$lib/components/PersonaAvatar.svelte';
	import RefusalDialog from '$lib/components/RefusalDialog.svelte';
	import SessionMenu from '$lib/components/SessionMenu.svelte';
	import { personasStore, settingsStore } from '$lib/localStorage';
	import { resolveSessionTitle } from '$lib/sessions';
	import { Sitemap } from '$lib/sitemap';
	import { pendingMessage } from '$lib/stores/pendingMessage';
	import { formatTimestampToNow, isTouchPrimary } from '$lib/utils';

	import type { PageData } from './$types';
	import ButtonCopyConversation from './ButtonCopyConversation.svelte';
	import Controls from './Controls.svelte';
	import Messages from './Messages.svelte';
	import Prompt from './Prompt.svelte';
	import SessionModal from './SessionModal.svelte';

	interface Props {
		data: PageData;
	}

	let { data }: Props = $props();

	/**
	 * The conversation itself, which is not this page.
	 *
	 * Everything a turn is made of lives in there: sending it, following it,
	 * picking it back up after a reload, folding the context away. What is left
	 * here is the screen it is drawn on, and the only thing the conversation asks
	 * of the screen is where the bottom of it is.
	 */
	// svelte-ignore state_referenced_locally
	const chat = new Conversation(data.session, {
		scrollToBottom: (force, smooth) => scrollToBottom(force, smooth)
	});

	let messagesWindow: HTMLDivElement | undefined = $state();
	let userScrolledUp = $state(false);
	let shouldConfirmDeletion = $state(false);
	let sessionModalOpen = $state(false);

	/**
	 * Where the composer is drawn: sticky at the foot of the conversation while you
	 * are reading it, in the column's own footer once the editor takes the screen.
	 */
	const floatingComposer = $derived(chat.editor.view === 'messages' && !chat.editor.isExpanded);

	/**
	 * The bar floats on the same terms, plus the setting.
	 *
	 * Reading a conversation is the only view where either of them has something to
	 * float over; with the editor or the controls filling the screen, both go back
	 * to being the column's edges.
	 */
	const floatingHeader = $derived($settingsStore.floatingChatHeader !== false && floatingComposer);

	// The chat composer floats over the message list (translucent + blur). We reserve
	// matching bottom space in the scroll area so the last message clears it. Only the
	// plain chat view floats; controls and the expanded code editor stay in flow.

	// The persona this conversation belongs to, if any (drives the header identity).
	const persona = $derived(
		chat.session.personaId ? $personasStore.find((p) => p.id === chat.session.personaId) : undefined
	);

	// Empty until the conversation has a real title (or a first user message to
	// derive one from) — the header falls back to "Session #id" until then.
	const sessionTitle = $derived(chat.editor.isNewSession ? '' : resolveSessionTitle(chat.session));

	$effect(() => {
		if (data.id !== chat.session.id) openConversation();
	});

	$effect(() => chat.syncModel());

	// Re-resolve the system prompt when the model changes (new/unedited sessions).
	$effect(() => {
		void chat.modelName;
		untrack(() => chat.autoResolveSystemPrompt());
	});

	// Taking focus back once an answer lands is a convenience with a mouse and a
	// nuisance with a thumb, where it reopens the keyboard over the reply nobody
	// has read yet. The request is still consumed either way, so it does not sit
	// around waiting to fire the next time the composer appears.
	$effect(() => {
		if (chat.editor.shouldFocusTextarea && chat.editor.promptTextarea) {
			if (!isTouchPrimary()) chat.editor.promptTextarea.focus();
			chat.editor.shouldFocusTextarea = false;
		}
	});

	/**
	 * Arriving from a search result: `?m=<index>` names the passage that was
	 * chosen, so land on it rather than at the bottom of the conversation.
	 */
	const searchMatchIndex = $derived.by(() => {
		const raw = page.url.searchParams.get('m');
		if (raw === null) return null;
		const index = Number(raw);
		return Number.isInteger(index) && index >= 0 ? index : null;
	});

	/**
	 * Watched rather than run once on mount.
	 *
	 * Opening a result from the search dialog is a client-side navigation: the
	 * component is reused, so `onMount` never fires again and the jump only ever
	 * worked on a full reload. Following the URL means it also works when the
	 * dialog is used twice in a row on the same conversation.
	 */
	$effect(() => {
		const index = searchMatchIndex;
		if (index === null) return;
		void highlightMessage(index);
	});

	/**
	 * The message may not be in the DOM yet — the conversation has just been
	 * swapped in and its articles render over the following frames — so wait for
	 * it rather than giving up on the first miss.
	 */
	async function highlightMessage(index: number): Promise<void> {
		await tick();

		let target: HTMLElement | null = null;
		for (let attempt = 0; attempt < 20 && !target; attempt++) {
			target = document.getElementById(`message-${index}`);
			if (!target) await new Promise((resolve) => requestAnimationFrame(resolve));
		}
		if (!target) return;

		target.scrollIntoView({ block: 'center' });

		// Restart the animation even when the same message is chosen twice: removing
		// the class isn't enough on its own, the reflow in between is what makes the
		// browser treat it as a new animation.
		target.classList.remove('message--found');
		void target.offsetWidth;
		target.classList.add('message--found');
		setTimeout(() => target?.classList.remove('message--found'), 2000);
	}

	onMount(() => {
		openConversation();
	});

	/**
	 * Hand the conversation whatever it was opened with.
	 *
	 * The two ways in are both the router's business rather than the
	 * conversation's: a message composed on the home page travels in a store, and
	 * a prompt named in the address travels in the URL. Both are read here, taken
	 * out of where they were so a refresh does not send them twice, and handed
	 * over as one thing.
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

			// Strip the one-shot params so a refresh doesn't re-submit the prompt
			// (and doesn't repopulate the input with already-sent text).
			const cleaned = new URL(page.url);
			cleaned.searchParams.delete('q');
			cleaned.searchParams.delete('model');
			cleaned.searchParams.delete('search');
			history.replaceState(history.state, '', cleaned);
		}

		void chat.open(data.session, { pending, query, atBottom: searchMatchIndex === null });
	}

	beforeNavigate((navigation) => {
		// Only a turn running in this tab is at risk from leaving it. One running in
		// the server keeps going and is waiting when the conversation is opened
		// again, so asking whether to abandon it would be asking about a danger that
		// no longer exists.
		if (chat.editor.isCompletionInProgress && chat.runLocation !== 'server') {
			const userConfirmed = confirm($LL.areYouSureYouWantToLeave());
			if (userConfirmed) {
				chat.stop();
				return;
			}
			navigation.cancel();
			return;
		}

		// Leaving a server-side turn only stops watching it.
		if (chat.runLocation === 'server') chat.detach();

		// Only show confirmation when navigating outside of /sessions/ path
		if (
			chat.editor.prompt &&
			chat.editor.prompt.trim() !== '' &&
			!navigation.to?.url.pathname.startsWith('/sessions/')
		) {
			const userConfirmed = confirm($LL.unsavedChangesWillBeLost());
			if (!userConfirmed) {
				navigation.cancel();
			}
		}
	});

	/**
	 * "Near enough to the bottom" needs slack: an exact comparison flips to
	 * `userScrolledUp` on a single pixel of sub-pixel rounding — which happens
	 * constantly while streamed content grows — and auto-follow silently stops.
	 */
	const SCROLL_BOTTOM_THRESHOLD = 32;

	/**
	 * Where the conversation is, read from the box itself.
	 *
	 * This is the only thing that ever puts auto-follow back on: you are following
	 * again once you are at the bottom, whether you got there with the button, with
	 * the wheel, or by letting the answer catch up with you.
	 *
	 * It is deliberately not the only thing that turns it off. Geometry cannot tell
	 * a scroll you made from a scroll the page made, and during a generation the
	 * page makes one every frame.
	 */
	function handleScroll() {
		if (!messagesWindow) return;
		const { scrollTop, scrollHeight, clientHeight } = messagesWindow;
		userScrolledUp = scrollTop + clientHeight < scrollHeight - SCROLL_BOTTOM_THRESHOLD;
	}

	/**
	 * Reading upwards stops the follow, at once, from the gesture rather than from
	 * where it lands.
	 *
	 * This is what the page was missing, and it is why scrolling during a
	 * generation caught: a flick of the wheel takes a moment to travel more than
	 * the slack above, and the next token landed inside that moment, scrolled to
	 * the bottom, and killed the momentum with it. Flick, snap back, flick, snap
	 * back. Nothing was wrong with the arithmetic; the intent simply arrived too
	 * late to be acted on.
	 *
	 * A wheel event fires before the scroll it causes, so setting this here means
	 * the frame that would have yanked you back reads it and does nothing.
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
	 * This used to be one `addEventListener` in `onMount`, which is a fix rather
	 * than a tidy-up: the scroller lives in the `else` of the view switch, so
	 * opening the model's controls destroyed it and coming back built a new one
	 * with nothing listening to it. From then on `userScrolledUp` was never set
	 * again, auto-follow was permanently on, and the page pulled you back to the
	 * bottom whatever you did.
	 *
	 * As an effect it follows the element, and cleans up after the one that left.
	 * Passive throughout: none of these ever cancels a gesture, they only read it.
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

	/**
	 * `smooth` is for the deliberate jump back (the button): the animation shows
	 * how far you travelled. Auto-follow during streaming stays instant — animating
	 * a scroll that retriggers on every token would never settle.
	 */
	async function scrollToBottom(shouldForceScroll = false, smooth = false) {
		if (!shouldForceScroll && (!messagesWindow || userScrolledUp)) return;
		// Streaming calls this on every chunk. Without coalescing, each one queued
		// its own frame and they piled up faster than they could run.
		if (!shouldForceScroll) {
			if (scrollQueued) return;
			scrollQueued = true;
		}
		await tick();
		requestAnimationFrame(() => {
			if (!shouldForceScroll) scrollQueued = false;
			if (!messagesWindow) return;
			// Re-checked here, not only on the way in: the user may have started
			// scrolling up between the call and this frame, and yanking them back
			// then also cleared `userScrolledUp` — so auto-follow resumed and the
			// page fought every attempt to read further up.
			if (!shouldForceScroll && userScrolledUp) return;
			messagesWindow.scrollTo({
				top: messagesWindow.scrollHeight,
				behavior: smooth ? 'smooth' : 'auto'
			});
		});
	}
</script>

{#snippet topBar(floating: boolean)}
	<Header confirmDeletion={shouldConfirmDeletion} {floating}>
		{#snippet headline()}
			{#if persona}
				<!-- Persona identity, laid out like the classic title/meta pair: avatar + name,
			     tagline as the muted second line. -->
				<div class="flex min-w-0 items-center gap-2.5" title={persona.tagline}>
					<PersonaAvatar {persona} size={32} />
					<div class="flex min-w-0 flex-col gap-0.5">
						<p class="truncate text-sm font-bold leading-tight text-active">{persona.name}</p>
						{#if persona.tagline}
							<p class="truncate text-xs leading-tight text-muted">{persona.tagline}</p>
						{/if}
					</div>
				</div>
			{:else}
				<!-- Once a conversation has a title it becomes the headline, with the id
			     kept as a parenthesised link so it stays copyable/navigable. -->
				<!-- leading-tight, not leading-none: `truncate` hides overflow, so a line box
			     the exact height of the font clips descenders. -->
				<p data-testid="session-id" class="truncate font-bold leading-tight">
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
				<div class="flex items-center gap-1.5 text-xs text-muted">
					{chat.editor.isNewSession
						? $LL.newSession()
						: formatTimestampToNow(chat.session.updatedAt ?? '')}
				</div>
			{/if}
		{/snippet}

		{#snippet nav()}
			{#if !persona}
				<!-- Model + settings as one control: the model belongs to this conversation's
			     configuration, so it sits with the button that opens it. Keeping it out
			     of the headline also leaves the title its full height. On mobile only the
			     settings half shows — the model is changed from inside the panel.
			     The border lives on the group rather than on each half, so focusing (or
			     opening) the picker rings the whole control instead of stopping mid-way. -->
				<div
					class="mr-1 flex items-center overflow-hidden rounded-md border border-shade-3 transition-colors focus-within:border-accent has-[[data-state=open]]:border-accent"
				>
					<span class="hidden lg:flex">
						<ModelSelect bind:value={chat.modelName} variant="attached" />
					</span>
					<!-- Transparent on the header's own background: the control is chrome, not
				     content, so it only lifts on hover. -->
					<button
						type="button"
						class="flex h-8 items-center justify-center bg-transparent px-2 text-muted transition-colors hover:bg-shade-2 hover:text-active"
						onclick={() => (sessionModalOpen = true)}
						title={$LL.session()}
						aria-label={$LL.session()}
					>
						<Settings2 class="base-icon" />
					</button>
				</div>
			{/if}
			{#if !chat.editor.isNewSession}
				{#if !shouldConfirmDeletion}
					<ButtonCopyConversation session={chat.session} assistantLabel={persona?.name} />
				{/if}
				<ButtonDelete sitemap={Sitemap.SESSIONS} id={chat.session.id} bind:shouldConfirmDeletion />
			{/if}
		{/snippet}

		<!-- The phone's two buttons. Deleting takes the pill over while it waits for an
		     answer, rather than asking somewhere else: there is nowhere else. -->
		{#snippet compact()}
			{#if shouldConfirmDeletion}
				<ButtonDelete sitemap={Sitemap.SESSIONS} id={chat.session.id} bind:shouldConfirmDeletion />
			{:else}
				<button
					type="button"
					class="flex h-9 w-9 items-center justify-center rounded-full text-muted transition-colors hover:bg-shade-2 hover:text-active"
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
							class="flex h-9 w-9 items-center justify-center rounded-full text-muted transition-colors hover:bg-shade-2 hover:text-active"
							aria-label={$LL.moreOptions()}
						>
							<MoreHorizontal class="h-5 w-5" />
						</button>
					{/snippet}

					<!-- The title lives here now, and this is the one place it has room to be
					     read: two lines, fixed, cut with an ellipsis past that, so the menu
					     never changes height with the conversation it belongs to. -->
					<p class="line-clamp-2 px-2 py-1.5 text-xs leading-snug text-muted">
						{chat.editor.isNewSession ? $LL.newSession() : resolveSessionTitle(chat.session)}
					</p>
					<div class="my-1 h-px bg-shade-3" role="none"></div>

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

	<!-- Under the bar rather than beneath it, so neither owes the other any room. -->
	{#if chat.editor.view === 'controls'}
		<div class="flex min-h-0 flex-grow flex-col surface-pane">
			<Controls bind:session={chat.session} />
		</div>
	{:else}
		<!-- The transcript and the button that returns to its foot, in one box: the
		     button then anchors to the conversation rather than to the column, and
		     stops needing to be told how tall the composer happens to be.

		     Its scrollbar gutter is reserved whether or not there is a scrollbar to
		     put in it, because the two floating bars live inside this box: otherwise
		     they would be a scrollbar narrower on a long conversation than on a short
		     one, and would shift sideways the moment a reply made the page overflow.
		     A no-op where scrollbars are drawn over the content and take no room, which
		     is the case this now asks for.

		     The scrollbar itself is the platform's, deliberately, where the rest of the
		     app styles its own. Styling one at all is what opts an element out of the
		     overlay behaviour macOS and iOS give it: any width, any colour, and the bar
		     stops fading away and sits there for the length of the conversation. That
		     trade is worth it on a code block, where a bar is how you learn the line
		     runs past the edge. It is not worth it down the side of the thing you are
		     reading. -->
		<div class="relative flex min-h-0 flex-grow flex-col">
			<div
				class="session__history flex flex-grow flex-col overflow-auto px-4 surface-pane lg:px-6 xl:px-8"
				style="scrollbar-gutter: stable"
				bind:this={messagesWindow}
			>
				{#if floatingHeader}
					<!-- The mirror image of the composer below: sticky rather than laid on
					     top, so it reserves its own room at the head of the conversation and
					     never covers the first message, while everything after it passes
					     behind on the way up. -->
					<div class="sticky top-0 z-20 -mx-4 lg:-mx-6 xl:-mx-8">
						{@render topBar(true)}
					</div>
				{/if}
				<!-- Grows to fill whatever the conversation does not, which is what puts the
				     composer at the foot of a short exchange instead of halfway up the page.
				     A sticky element only sticks once there is something to scroll; below
				     that it simply sits where the flow leaves it, and the flow is what this
				     corrects. -->
				<div class="grow">
					<Messages
						bind:session={chat.session}
						bind:editor={chat.editor}
						handleRetry={chat.retry}
						chooseAnswer={chat.answerChoice}
						pendingChoice={chat.pendingChoice}
						assistantLabel={persona?.name}
						isCompacting={chat.isCompacting}
						onCancelCompaction={chat.cancelCompaction}
						onAddMention={chat.addMention}
						onTogglePlaybook={chat.togglePlaybook}
					/>
				</div>

				{#if floatingComposer}
					<!-- Sticky rather than laid on top, which is the whole of the difference:
					     it stays in the flow, so it reserves its own room at the end of the
					     conversation and never covers the last message, while everything above
					     passes behind it on the way there. Nothing measures it, nothing pads
					     for it. The negative margins undo the transcript's side gutter so it
					     spans the column rather than the text; there is no vertical one left to
					     undo, because a stuck element anchors to the inside of the scrollport
					     and a padding there would have pushed it back down. -->
					<div class="sticky bottom-0 z-10 -mx-4 lg:-mx-6 xl:-mx-8">
						<!-- Scrolling up during a reply silently opts you out of auto-follow;
						     without this there is nothing to say content is still arriving below,
						     nor any way back short of dragging. Carried by the composer, so it
						     stands above it without anyone having to know how tall it is. -->
						{#if userScrolledUp}
							<button
								type="button"
								transition:fly={{ y: 8, duration: 150 }}
								onclick={() => scrollToBottom(true, true)}
								aria-label={$LL.scrollToBottom()}
								title={$LL.scrollToBottom()}
								class="scroll-to-bottom absolute -top-11 left-1/2 z-20 flex h-9 w-9 -translate-x-1/2 items-center justify-center rounded-full border border-shade-3 bg-shade-0 text-muted shadow-md transition-colors hover:text-active"
							>
								<ArrowDown class="base-icon" />
							</button>
						{/if}
						{@render composer()}
					</div>
				{/if}
			</div>
		</div>
	{/if}

	<!-- Drawn in one of two places, never both, which is why it is written once and
	     rendered where it belongs. -->
	{#if !floatingComposer}
		<div class="shrink-0 surface-chrome">
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
