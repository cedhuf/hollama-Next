import type { Editor, Message, Session } from '$lib/sessions';

import type { RunEvent } from './types';

/**
 * What a run's events do to what is on screen. Only to what is on screen.
 *
 * This used to be where the conversation was written down, and that was the
 * defect: the turn ran in the server and the answer only reached the database if
 * a browser was still there to put it there. The run now writes as it produces,
 * so what is left here is the live picture of a turn happening, which is the one
 * job a page actually has.
 *
 * Nothing in here persists anything, and that is a property worth keeping rather
 * than a detail: a second interface, or a third-party client, can follow a run
 * without being trusted to store it correctly.
 *
 * Everything is additive and order-dependent, which is what makes a replay land
 * in the same place as having watched it live.
 */

export interface RunSurface {
	editor: Editor;
	session: Session;
	/** Called when new text arrived, so a follower can keep the bottom in view. */
	onProgress?(): void;
	/** Called when the turn ends, whichever way it ended. */
	onFinish?(outcome: { aborted: boolean; error?: string }): void;
	/** Whether a summary is being written, drawn where the divider will land. */
	setCompacting?(active: boolean): void;
}

export interface ApplyOptions {
	/**
	 * Whether this event already happened before anyone was watching.
	 *
	 * It changes nothing about what the event means, and everything about what is
	 * worth doing while it is applied. A hundred fragments of a reply that was
	 * finished minutes ago are handed over in a single flush: following each one to
	 * the bottom of the conversation is a hundred answers to a question nobody
	 * asked. The caller scrolls once, at the end, when it knows where the end is.
	 */
	replay?: boolean;
}

/**
 * Whether a message the run produced is already in the conversation.
 *
 * By the instant it was created, which the run stamps once and never rewrites, so
 * it identifies that message across every delivery of the event carrying it.
 *
 * Still needed now that nothing here writes, and for a plainer reason than
 * before: a conversation is read from storage when the page opens, so a run that
 * is still going has already put some of what it is about to replay into it. The
 * check is what lets the replay rebuild the half-written bubble without laying a
 * second copy of the finished messages on top.
 */
function alreadyApplied(session: Session, createdAt: string | undefined): boolean {
	if (!createdAt) return false;
	return session.messages.some((message) => message.createdAt === createdAt);
}

export function applyRunEvent(
	event: RunEvent,
	surface: RunSurface,
	{ replay = false }: ApplyOptions = {}
): void {
	const { editor, session } = surface;
	const progress = () => {
		if (!replay) surface.onProgress?.();
	};

	switch (event.type) {
		case 'speaker':
			// A new voice: whatever the previous one had half-written has already been
			// closed by its own `message`, so this only has to say who is next.
			editor.speakerPersonaId = event.personaId;
			editor.speakerName = event.name;
			editor.completion = '';
			editor.reasoning = '';
			editor.reasoningTrace = undefined;
			return;

		case 'content':
			editor.completion = (editor.completion ?? '') + event.text;
			progress();
			return;

		case 'thinking':
			editor.reasoning = (editor.reasoning ?? '') + event.text;
			progress();
			return;

		case 'round':
			// Only the rounds after the first clear anything: the first is the turn
			// starting, and its reset already happened when the turn was armed.
			if (event.index === 0) return;
			editor.completion = '';
			editor.reasoning = '';
			return;

		case 'trace':
			editor.reasoningTrace = [...(editor.reasoningTrace ?? []), event.step];
			return;

		case 'searching':
			editor.isSearching = event.active;
			if (event.active) {
				editor.searchActivity = event.activity;
				// Only a rewritten query is short enough to show, and the run is what
				// decides that: an absent one here means "show nothing", not "unchanged".
				editor.searchQuery = event.query;
			}
			return;

		case 'approval':
			// The turn is stopped until this is answered. Replayed as readily as it is
			// received: a tab that reloads mid-question has to find the question, and
			// the `approvalResolved` that follows is what takes it away.
			editor.pendingApproval = event.request;
			progress();
			return;

		case 'approvalResolved':
			// Only if it is still the one on screen. Two questions in a row, answered
			// out of order, must not have the first one's answer clear the second.
			if (editor.pendingApproval?.id === event.id) editor.pendingApproval = undefined;
			return;

		case 'sources':
			editor.webSearchInfo = event.info;
			return;

		case 'message': {
			// Already here, because the conversation was read from storage after the
			// run had written this into it. The streaming state is still cleared,
			// since the event still happened: applying it twice has to land where
			// applying it once does, and that includes the bubble it closes.
			if (alreadyApplied(session, event.message.createdAt)) {
				editor.completion = '';
				editor.reasoning = '';
				editor.reasoningTrace = undefined;
				return;
			}

			// The live reasoning panel's state is stamped on at this point rather than
			// after the message mounts, so the completed article appears with the panel
			// already in the right state instead of re-opening a frame later. A view
			// decision, which is why it is added here and not carried on the event.
			const message: Message = {
				...event.message,
				isReasoningVisible: !!(editor.streamingReasoningExpanded && event.message.reasoning)
			};
			session.messages = [...session.messages, message];
			session.updatedAt = message.createdAt ?? new Date().toISOString();
			editor.completion = '';
			editor.reasoning = '';
			editor.reasoningTrace = undefined;
			progress();
			return;
		}

		case 'title':
			// Never over a name someone typed. The run cannot know: it was asked for a
			// title before the turn went out, and the conversation may have been
			// renamed while it was being written.
			if (session.titleEdited) return;
			// A conversation that already had a title is being named again, and that
			// happens once. Marked here rather than where it was asked for, because
			// here is where it actually landed.
			if (session.title) session.titleRegenerated = true;
			session.title = event.title;
			session.updatedAt = new Date().toISOString();
			return;

		case 'compacting':
			surface.setCompacting?.(event.active);
			return;

		case 'compaction':
			// Same reasoning as `message`: replayed onto a conversation that already
			// holds the marker, this would draw a second boundary where there is one,
			// and a conversation that hides half of itself twice over.
			if (alreadyApplied(session, event.marker.createdAt)) return;
			session.messages = [...session.messages, event.marker];
			session.updatedAt = new Date().toISOString();
			return;

		case 'done':
			editor.isCompletionInProgress = false;
			editor.pendingApproval = undefined;
			editor.speakerPersonaId = undefined;
			editor.speakerName = undefined;
			editor.shouldFocusTextarea = true;
			surface.onFinish?.({ aborted: false });
			return;

		case 'usage':
			// Counted where it can also be refused, which is the relay the request went
			// through. Nothing to do here.
			return;

		case 'error':
			editor.isCompletionInProgress = false;
			editor.pendingApproval = undefined;
			// Whatever the turn had written by the time it stopped arrived as a
			// `message` of its own, just before this. Rebuilding it from the
			// half-written bubble is what this used to do, and it was the reason a
			// stopped answer could be appended twice.
			editor.speakerPersonaId = undefined;
			editor.speakerName = undefined;
			editor.completion = '';
			editor.reasoning = '';
			editor.reasoningTrace = undefined;
			surface.onFinish?.({
				aborted: event.aborted,
				error: event.aborted ? undefined : event.message
			});
			return;
	}
}
