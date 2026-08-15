import type { Editor, Message, Session } from '$lib/sessions';

import type { RunEvent } from './types';

/**
 * What a run's events do to what is on screen.
 *
 * One reducer, deliberately, because there are two sources and they must not
 * drift: a turn running in this tab and a turn running in the Node process
 * produce the same events, and a tab that comes back after a reload replays the
 * ones it missed. If catching up did not go through exactly this function, a
 * reattached conversation would be a second implementation of the first, and the
 * two would disagree the first time either changed.
 *
 * Everything here is additive and order-dependent, which is what makes a replay
 * land in the same place as having watched it live.
 */

export interface RunSurface {
	editor: Editor;
	session: Session;
	/** Called once the conversation itself changed and is worth persisting. */
	save(): void;
	/** Called when new text arrived, so a follower can keep the bottom in view. */
	onProgress?(): void;
	/** Called when the turn ends, whichever way it ended. */
	onFinish?(outcome: { aborted: boolean; error?: string }): void;
	/** Whether a summary is being written, drawn where the divider will land. */
	setCompacting?(active: boolean): void;
}

export function applyRunEvent(event: RunEvent, surface: RunSurface): void {
	const { editor, session } = surface;

	switch (event.type) {
		case 'content':
			editor.completion = (editor.completion ?? '') + event.text;
			surface.onProgress?.();
			return;

		case 'thinking':
			editor.reasoning = (editor.reasoning ?? '') + event.text;
			surface.onProgress?.();
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

		case 'sources':
			editor.webSearchInfo = event.info;
			return;

		case 'message': {
			// The live reasoning panel's state is stamped on at this point rather than
			// after the message mounts, so the completed article appears with the panel
			// already in the right state instead of re-opening a frame later.
			const message: Message = {
				...event.message,
				reasoningTrace: editor.reasoningTrace,
				isReasoningVisible: !!(editor.streamingReasoningExpanded && event.message.reasoning)
			};
			session.messages = [...session.messages, message];
			session.updatedAt = message.createdAt ?? new Date().toISOString();
			editor.completion = '';
			editor.reasoning = '';
			editor.reasoningTrace = undefined;
			surface.save();
			surface.onProgress?.();
			return;
		}

		case 'title':
			session.title = event.title;
			session.updatedAt = new Date().toISOString();
			surface.save();
			return;

		case 'compacting':
			surface.setCompacting?.(event.active);
			return;

		case 'compaction':
			session.messages = [...session.messages, event.marker];
			session.updatedAt = new Date().toISOString();
			surface.save();
			return;

		case 'done':
			editor.isCompletionInProgress = false;
			editor.shouldFocusTextarea = true;
			surface.onFinish?.({ aborted: false });
			return;

		case 'error':
			editor.isCompletionInProgress = false;
			// What the model had already written is kept: an answer cut off halfway is
			// still worth more than an empty conversation, and the user can see where
			// it stopped. Only a turn that produced nothing leaves nothing behind.
			if (!event.aborted || editor.completion || editor.reasoning) {
				if (editor.completion || editor.reasoning) {
					session.messages = [
						...session.messages,
						{
							role: 'assistant',
							content: editor.completion || '',
							reasoning: editor.reasoning,
							reasoningTrace: editor.reasoningTrace,
							isReasoningVisible: !!(editor.streamingReasoningExpanded && editor.reasoning),
							createdAt: new Date().toISOString()
						}
					];
					session.updatedAt = new Date().toISOString();
					surface.save();
				}
			}
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
