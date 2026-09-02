import type { Editor, Message, Session } from '$lib/sessions';

import type { RunEvent } from './types';

/**
 * What a run's events do to what is on screen. Only to what is on screen: the
 * run writes as it produces, so nothing here persists anything, and a second
 * interface can follow a run without being trusted to store it.
 *
 * Everything is additive and order-dependent, which makes a replay land where
 * having watched it live does.
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
	 * Whether this event already happened before anyone was watching. It changes
	 * nothing about what the event means and everything about what is worth doing:
	 * a hundred fragments arrive in one flush, and following each to the bottom is a
	 * hundred answers to a question nobody asked.
	 */
	replay?: boolean;
}

/**
 * Whether a message the run produced is already in the conversation, by the
 * instant it was created, which the run stamps once and never rewrites.
 *
 * A conversation is read from storage when the page opens, so a run still going
 * has already put some of what it is about to replay into it. This is what lets
 * the replay rebuild the half-written bubble without a second copy of the rest.
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
			// A new voice: whatever the previous one had half-written was closed by its own
			// `message`, so this only has to say who is next.
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
			// starting, and its reset happened when the turn was armed.
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
				// Only a rewritten query is short enough to show, and the run decides that: an
				// absent one means "show nothing", not "unchanged".
				editor.searchQuery = event.query;
			}
			return;

		case 'approval':
			// The turn is stopped until this is answered. Replayed as readily as received:
			// a tab that reloads mid-question has to find the question, and the
			// `approvalResolved` that follows is what takes it away.
			editor.pendingApproval = event.request;
			progress();
			return;

		case 'approvalResolved':
			// Only if it is still the one on screen: two questions answered out of order
			// must not have the first one's answer clear the second.
			if (editor.pendingApproval?.id === event.id) editor.pendingApproval = undefined;
			return;

		case 'sources':
			editor.webSearchInfo = event.info;
			return;

		case 'message': {
			// Already here, because the conversation was read from storage after the run
			// wrote this into it. The streaming state is still cleared, since applying twice
			// has to land where applying once does.
			if (alreadyApplied(session, event.message.createdAt)) {
				editor.completion = '';
				editor.reasoning = '';
				editor.reasoningTrace = undefined;
				return;
			}

			// The reasoning panel's state is stamped on here rather than after the message
			// mounts, so the completed article appears in the right state instead of
			// re-opening a frame later. A view decision, hence not on the event.
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
			// Never over a name someone typed: the run was asked for a title before the turn
			// went out, and the conversation may have been renamed since.
			if (session.titleEdited) return;
			// A conversation that already had a title is being named again, and that happens
			// once. Marked here, where it actually landed.
			if (session.title) session.titleRegenerated = true;
			session.title = event.title;
			session.updatedAt = new Date().toISOString();
			return;

		case 'compacting':
			surface.setCompacting?.(event.active);
			return;

		case 'compaction':
			// Same reasoning as `message`: replayed onto a conversation that already holds
			// the marker, this would draw a second boundary.
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
			// through.
			return;

		case 'error':
			editor.isCompletionInProgress = false;
			editor.pendingApproval = undefined;
			// Whatever the turn had written arrived as a `message` of its own just before
			// this. Rebuilding it from the half-written bubble is what this used to do, and
			// it was why a stopped answer could be appended twice.
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
