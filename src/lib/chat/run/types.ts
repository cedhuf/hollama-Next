import type { OllamaOptions } from '$lib/chat/ollama';
import type { McpApprovalRequest } from '$lib/mcp';
import type { Message, ReasoningStep, WebSearchInfo } from '$lib/sessions';

/**
 * What a turn is, said once, so it can be run anywhere.
 *
 * A generation used to be a method on a component: it read the stores around it,
 * wrote its progress into the editor's state, and died with the page. That last
 * part is the defect. A reload, a navigation, or iOS reclaiming a backgrounded
 * tab took the answer with it, even though the model was still writing it.
 *
 * So the turn is described as data, and what it produces is described as events.
 * Neither mentions the browser. The same orchestrator then runs in the page or in
 * the Node process, and the page becomes a reducer over the events either one
 * emits, which is also what makes reattaching after a reload nothing more than
 * replaying the log.
 */

/** How eagerly to use the provider's own tool calling. The setting's own values. */
export type NativeToolsPreference = 'off' | 'auto' | 'force';

/**
 * One voice in a turn, when the turn has more than one.
 *
 * Calling a persona with `@` does not add an instruction to the conversation's
 * assistant: it hands the turn to somebody else, with their model, their
 * options, their prompt and their tools. Which is why a speaker carries the
 * fields it overrides rather than a persona id the runner would have to look up
 *: the run has no library, and by the time it starts every question about who
 * is answering has to be settled.
 *
 * The ordinary turn is one speaker with no persona, and says so by having none.
 */
export interface RunSpeaker {
	personaId: string;
	/** How the reply is attributed, on screen and in what later turns are sent. */
	name: string;
	/**
	 * The connection to talk to, named rather than described: the server resolves
	 * its address and its key from its own database, which is the whole point of
	 * the proxy. A key never reaches a browser, so a browser has none to hand over.
	 */
	serverId: string;
	model: string;
	options?: Partial<OllamaOptions>;
	think: boolean;
	/** Its own prompt, already framed by the one that says it was called into a conversation. */
	systemPrompt?: string;
	flags: RunFlags;
	capabilities: RunCapabilities;
}

/** The toggles the composer offers, for one message. */
export interface RunFlags {
	webSearch: boolean;
	webFetch: boolean;
	interactiveChoices: boolean;
	sendCurrentDate: boolean;
	nativeTools: NativeToolsPreference;
	/**
	 * Whether the MCP servers this account has switched on are offered this turn.
	 *
	 * On by default and per conversation, like the web toggles beside it. Off is
	 * not a refusal of the calls, it is not sending the catalogues at all: a turn
	 * that will never need somebody's forty tools should not be paying for their
	 * definitions in every request it makes.
	 */
	mcp: boolean;
	/** Let the model decide whether a search is worth it, in the text protocol. */
	webSearchAuto: boolean;
}

/** What each tool is actually able to do here, decided by config, not by hope. */
export interface RunCapabilities {
	search: boolean;
	fetch: boolean;
}

/** Everything a turn needs, resolved by the caller and settled before it starts. */
export interface RunInput {
	/** The conversation this belongs to, so a reattaching client can find its run. */
	sessionId: string;
	/** The connection to talk to. Named by id; the server resolves the rest. */
	serverId: string;
	model: string;
	options?: Partial<OllamaOptions>;
	/** Whether the model may reason. False never asks for it. */
	think: boolean;
	/** The session's own system prompt, already resolved. Empty means none. */
	systemPrompt?: string;
	/**
	 * The persona whose conversation this is, when there is one.
	 *
	 * Carried so a turn can find what that persona remembers about the account
	 * asking. Never used to look the persona up otherwise: everything else about
	 * it is already resolved into the fields above, on purpose.
	 */
	personaId?: string;
	/**
	 * The conversation as the model should receive it: already cut back to the
	 * last compaction marker, still carrying its markers and images.
	 */
	messages: Message[];
	/** The toggles the composer offers, for this message only. */
	flags: RunFlags;
	capabilities: RunCapabilities;
	/**
	 * Who answers, when it is not the conversation's own assistant.
	 *
	 * Empty or absent is the ordinary turn. Otherwise each entry answers in order,
	 * and the conversation's assistant does not: naming somebody is choosing them,
	 * not adding them.
	 */
	speakers?: RunSpeaker[];
	/**
	 * Who is answering this particular pass, set by the driver rather than by the
	 * caller. It is what stamps the reply so a later turn can attribute it.
	 */
	speaker?: { personaId: string; name: string };
	/**
	 * Whether each speaker reads the ones before it.
	 *
	 * On by default, because that is what a conversation with several people is.
	 * Off gives each of them the same question and none of the others' answers,
	 * which is what you want when you are asking for independent opinions rather
	 * than for a discussion.
	 */
	sequential?: boolean;
	/** The user's prompt overrides, so the run resolves the same text the page would. */
	promptOverrides?: Record<string, string>;
	/** Set when this turn should also name the conversation once it lands. */
	title?: {
		model: string;
		serverId?: string;
	};
	/** Set when the conversation is due for compaction once this turn lands. */
	compact?: {
		model: string;
		serverId?: string;
		/** How many of the most recent messages to leave outside the summary. */
		keepRecent: number;
	};
}

/**
 * One thing that happened, in the order it happened.
 *
 * Deliberately small and additive: a client that joins late replays the whole
 * list and arrives at the same state as one that watched it live. Anything that
 * cannot be replayed that way does not belong in here.
 */
export type RunEvent =
	/**
	 * A new voice takes the turn.
	 *
	 * Sent before anything that voice produces, including for the ordinary
	 * single-speaker turn, where it carries no persona. A client that joins late
	 * therefore learns who is speaking by replaying, exactly as it learns
	 * everything else, instead of having to be told separately.
	 */
	| { type: 'speaker'; personaId?: string; name?: string }
	/** A fragment of the answer. */
	| { type: 'content'; text: string }
	/** A fragment of the model's reasoning for the round in progress. */
	| { type: 'thinking'; text: string }
	/**
	 * A new round starts, so the live reasoning belongs to the past.
	 *
	 * Sent instead of letting the client guess from a `trace` arriving: the trace
	 * only carries reasoning worth keeping, and a round that thought about nothing
	 * still has to clear the panel.
	 */
	| { type: 'round'; index: number }
	/** A finished step joins the timeline above the live reasoning. */
	| { type: 'trace'; step: ReasoningStep }
	/** Whether a lookup is in flight, and which kind, for the live indicator. */
	| { type: 'searching'; active: boolean; activity?: 'search' | 'read' | 'tool'; query?: string }
	/**
	 * The turn is stopped, waiting to be told whether it may make this call.
	 *
	 * An event rather than a question asked of whoever started the turn, because
	 * by now there may be nobody there: the run outlives the tab. A client that
	 * arrives late replays this and finds the question still standing, and the
	 * answer goes back over its own route rather than up the stream.
	 */
	| { type: 'approval'; request: McpApprovalRequest }
	/** How that question ended, so every watching client stops asking it. */
	| {
			type: 'approvalResolved';
			id: string;
			allowed: boolean;
			by: 'user' | 'timeout' | 'aborted';
	  }
	/** What the turn has put in front of the model so far. */
	| { type: 'sources'; info: WebSearchInfo }
	/** The turn's answer, complete and ready to be appended to the conversation. */
	| { type: 'message'; message: Message }
	/** A title was written for the conversation. */
	| { type: 'title'; title: string }
	/** A summary is being written, which the conversation draws where it will land. */
	| { type: 'compacting'; active: boolean }
	/** The conversation was compacted, and this marker replaces what came before it. */
	| { type: 'compaction'; marker: Message; replacedCount: number }
	/** The turn is over. Nothing follows. */
	/**
	 * What the provider says the turn consumed, once, at the end.
	 *
	 * Carried as an event like everything else so a reattaching client gets it on
	 * replay and the local and server paths report it the same way.
	 */
	| {
			type: 'usage';
			used: { input: number; output: number };
			/**
			 * Which model and which connection spent it.
			 *
			 * On the event rather than inferred from the run, because a turn can have
			 * several voices and each brings its own: reading the conversation's model
			 * would price a persona's answer at the wrong rate, or at a rate that does
			 * not exist on that connection at all.
			 */
			model?: string;
			serverId?: string;
	  }
	| { type: 'done' }
	/**
	 * The turn failed, or was cancelled.
	 *
	 * Cancellation is an ending like any other here rather than an exception,
	 * because a client that reattaches has to be told why nothing more is coming.
	 */
	| { type: 'error'; message: string; aborted: boolean };

/** An event with its place in the log, which is what resumption is addressed by. */
export interface SequencedRunEvent {
	id: number;
	event: RunEvent;
}

export type RunStatus = 'running' | 'done' | 'error' | 'aborted';

/** What a client is told about a run it has not been watching. */
export interface RunSummary {
	id: string;
	sessionId: string;
	status: RunStatus;
	startedAt: string;
	/** The id of the last event written, so a client knows what it is catching up to. */
	lastEventId: number;
}

/** True for the endings after which no further event will ever arrive. */
export function isFinal(status: RunStatus): boolean {
	return status !== 'running';
}
