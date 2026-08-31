<script lang="ts">
	import { ChevronLeft, SquarePen } from '@lucide/svelte';
	import { onMount } from 'svelte';

	import LL from '$i18n/i18n-svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { Conversation } from '$lib/chat/conversation.svelte';
	import Head from '$lib/components/Head.svelte';
	import ModelSelect from '$lib/components/ModelSelect.svelte';
	import { resolveSessionTitle } from '$lib/sessions';
	import { pendingMessage } from '$lib/stores/pendingMessage';
	import { generateRandomId } from '$lib/utils';

	import Messages from '../../../sessions/[id]/Messages.svelte';
	import Composer from './Composer.svelte';

	/**
	 * One conversation, on a phone.
	 *
	 * The engine is the app's own, unchanged: `Conversation` holds the turn, the
	 * tools, the streaming and the picking back up after a reload, and it was
	 * lifted out of the desktop page precisely so a second interface could drive it
	 * without any of that being written twice.
	 *
	 * The messages are the app's own too. `Messages` renders markdown, reasoning,
	 * tool calls, sources, generated images and every divider, and none of that is
	 * worth a second implementation to make bubbles out of. What this file adds is
	 * the arrangement: a header, a composer built for one thumb, and the stylesheet
	 * at the foot that turns those articles into a phone conversation.
	 */
	let { data } = $props();

	let bottom: HTMLDivElement | undefined = $state();

	// svelte-ignore state_referenced_locally
	const chat = new Conversation(data.session, {
		scrollToBottom: () => bottom?.scrollIntoView({ block: 'end' })
	});

	onMount(() => {
		const pending = $pendingMessage;
		pendingMessage.set(null);
		void chat.open(data.session, { pending, atBottom: true });
	});

	const title = $derived(
		chat.editor.isNewSession ? $LL.newSession() : resolveSessionTitle(chat.session)
	);
</script>

<Head {title} />

<div class="flex h-full flex-col">
	<!-- The controls stand on the page, not on the conversation: the way back, what
	     is answering, and a fresh start. Reading a thread is one thing and steering
	     it is another, and giving the second its own strip is what lets the first
	     be a surface of its own. -->
	<header class="flex shrink-0 items-center gap-2 px-4 py-3">
		<button
			type="button"
			onclick={() => goto(resolve('/m/sessions'))}
			aria-label={$LL.back()}
			class="glass text-muted flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
		>
			<ChevronLeft class="h-5 w-5" />
		</button>

		<div class="flex min-w-0 flex-1 justify-center">
			<span class="glass flex h-10 min-w-0 items-center rounded-full px-3">
				<ModelSelect bind:value={chat.modelName} variant="ghost" />
			</span>
		</div>

		<button
			type="button"
			onclick={() => goto(resolve('/m/sessions/[id]', { id: generateRandomId() }))}
			aria-label={$LL.newSession()}
			class="glass text-muted flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
		>
			<SquarePen class="h-4 w-4" />
		</button>
	</header>

	<!-- The conversation is a sheet, risen from the foot of the screen and stopping
	     short of the top. What it buys is the thing the controls above need: they
	     are on the page, it is over the page, and the two never have to share a
	     background or argue about which one the eye reads first. -->
	<div class="sheet flex min-h-0 flex-1 flex-col overflow-hidden rounded-t-[1.75rem]">
		<div class="thread min-h-0 flex-1 overflow-y-auto px-4 pt-4 pb-2">
			<Messages
				bind:session={chat.session}
				bind:editor={chat.editor}
				handleRetry={chat.retry}
				chooseAnswer={chat.answerChoice}
				pendingChoice={chat.pendingChoice}
				onApproveTool={chat.approveTool}
				isCompacting={chat.isCompacting}
				onCancelCompaction={chat.cancelCompaction}
				onAddMention={chat.addMention}
				onTogglePlaybook={chat.togglePlaybook}
			/>
			<div bind:this={bottom}></div>
		</div>

		<!-- Inside the sheet, above the tab bar, in the flow: it reserves its own
		     room, so the thread scrolls to a foot it can actually reach. -->
		<div class="shrink-0 px-3 pb-[calc(var(--safe-bottom)+5.5rem)]">
			<Composer
				bind:editor={chat.editor}
				onSubmit={chat.submit}
				disabled={chat.editor.isCompletionInProgress}
			/>
		</div>
	</div>
</div>

<style lang="postcss">
	/* The sheet: the page's own darkest surface, so the glow behind shows around it
	   and not through it, with a hairline along the top edge where it meets the
	   controls. */
	.sheet {
		background-color: var(--color-shade-0);
		box-shadow:
			inset 0 1px 0 color-mix(in srgb, white 8%, transparent),
			0 -12px 32px -12px rgb(0 0 0 / 0.45);
	}

	.glass {
		background-color: color-mix(in srgb, var(--color-shade-1) 55%, transparent);
		backdrop-filter: blur(24px) saturate(180%);
		-webkit-backdrop-filter: blur(24px) saturate(180%);
		box-shadow: inset 0 1px 0 color-mix(in srgb, white 45%, transparent);
	}

	/*
	 * The mobile skin.
	 *
	 * Not a second renderer: the articles are the app's own, and these rules
	 * rearrange them. Which is possible at all because the desktop already draws
	 * your own turns as a bubble on the right; what is left to say is that on a
	 * phone it should be filled rather than tinted, and that the role badges are
	 * not worth a line each when the side already says who spoke.
	 *
	 * The hooks are classes `Article` puts on itself. If one moves, it shows here,
	 * and here is twenty lines.
	 */
	.thread :global(.article) {
		max-width: 100%;
		margin-bottom: 0.75rem;
	}

	.thread :global(.article__nav) {
		display: none;
	}

	/* Filled rather than tinted, and the text with it: at arm's length on a bright
	   pavement, a ten percent wash is not a side. */
	.thread :global(.article--user .article__bubble) {
		background-color: var(--color-accent);
		color: var(--color-shade-0);
	}

	.thread :global(.article--user .article__bubble *) {
		color: inherit;
	}
</style>
