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
	/**
	 * A persona called in with `@` has just answered, for the first time.
	 *
	 * Inside the idempotence guard rather than beside it, which is the whole
	 * reason it is here and not in the page: a finished run is replayed to a tab
	 * that comes back, and a notification sent on every delivery would write the
	 * same record into the persona's conversation on every visit.
	 *
	 * A notification, not a side effect of its own: this file changes the
	 * conversation it was given and nothing else, and what a persona's own
	 * conversation does about it is the page's business.
	 */
	onPersonaReply?(reply: Message): void;
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
 * Compared against the tail rather than the whole conversation: a run appends,
 * always, so anything it produced is at the end or is not there at all.
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

		case 'sources':
			editor.webSearchInfo = event.info;
			return;

		case 'message': {
			// Already here: this event has been applied before.
			//
			// Which happens for an ordinary reason, not an exotic one. A finished run
			// is kept for a few minutes so a tab that was closed mid-answer can still
			// collect it, and coming back to the conversation in that window replays
			// the log from the start. The tab that watched it live had already applied
			// and saved every one of those events, so the reply landed a second time,
			// and a third on the next visit.
			//
			// Identity rather than a guard: the timestamp is stamped once, by the run,
			// when the message is built, so the same event carries the same one however
			// many times it is delivered. That is what makes replay idempotent, which
			// is the property this whole file claims and did not have.
			//
			// The streaming state is still cleared, because the event still happened:
			// applying it twice has to land in the same place as applying it once, and
			// that includes the half-written bubble it closes.
			if (alreadyApplied(session, event.message.createdAt)) {
				editor.completion = '';
				editor.reasoning = '';
				editor.reasoningTrace = undefined;
				return;
			}

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
			if (message.personaId) surface.onPersonaReply?.(message);
			editor.completion = '';
			editor.reasoning = '';
			editor.reasoningTrace = undefined;
			surface.save();
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
			surface.save();
			return;

		case 'compacting':
			surface.setCompacting?.(event.active);
			return;

		case 'compaction':
			// Same reasoning as `message`: a replayed compaction would append a second
			// marker, and two boundaries where there is one is a conversation that
			// hides half of itself twice over.
			if (alreadyApplied(session, event.marker.createdAt)) return;
			session.messages = [...session.messages, event.marker];
			session.updatedAt = new Date().toISOString();
			surface.save();
			return;

		case 'done':
			editor.isCompletionInProgress = false;
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
							createdAt: new Date().toISOString(),
							// A half-written answer keeps its author: it is still theirs, and a
							// later turn has to attribute it as such.
							personaId: editor.speakerPersonaId,
							personaName: editor.speakerName
						}
					];
					session.updatedAt = new Date().toISOString();
					surface.save();
				}
			}
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
